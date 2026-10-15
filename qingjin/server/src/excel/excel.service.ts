import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { isDeepStrictEqual } from 'node:util';
import { AuditService } from '../audit/audit.service';
import { compactModel } from '../common/media-url';
import { PARAM_KEY_PATTERN, SLUG_PATTERN } from '../common/patterns';
import type { MachineStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STATUS_LABEL: Record<MachineStatus, string> = { PUBLISHED: '已上架', DRAFT: '草稿', HIDDEN: '隐藏' };
const LABEL_STATUS = new Map(Object.entries(STATUS_LABEL).map(([k, v]) => [v, k as MachineStatus]));
const MACHINE_COLS = ['slug', '型号', '分类', '中文名称', '英文名称', '状态', '推荐', '排序'] as const;
const PARAM_COLS = ['slug', '参数键', '中文参数名', '英文参数名', '中文值', '英文值'] as const;
const MAX_ROWS = 5000;

type Param = { key: string; labelZh: string; labelEn: string; valueZh: string; valueEn: string };
type Row = { slug: string; model: string; category: string; nameZh: string; nameEn: string; status: MachineStatus; featured: boolean; sort: number | null; row: number };
export type ImportError = { sheet: string; row: number; message: string };

/** Cell text regardless of how Excel stored it (rich text, numbers, formulas, hyperlinks). */
function text(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    if (o.result !== undefined) return String(o.result).trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4FAE' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

@Injectable()
export class ExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportMachines(filter: { categoryId?: string; status?: MachineStatus }): Promise<Buffer> {
    const [categories, machines] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.machine.findMany({
        where: { categoryId: filter.categoryId || undefined, status: filter.status || undefined },
        orderBy: [{ category: { sort: 'asc' } }, { sort: 'asc' }],
        include: { category: { select: { slug: true } }, params: { orderBy: { sort: 'asc' } } },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'QING JIN Admin';
    const ms = wb.addWorksheet('机型');
    ms.columns = [
      { header: 'slug', width: 22 },
      { header: '型号', width: 16 },
      { header: '分类', width: 16 },
      { header: '中文名称', width: 30 },
      { header: '英文名称', width: 36 },
      { header: '状态', width: 10 },
      { header: '推荐', width: 8 },
      { header: '排序', width: 8 },
    ];
    for (const m of machines) ms.addRow([m.slug, m.model, m.category.slug, m.nameZh, m.nameEn, STATUS_LABEL[m.status], m.featured ? '是' : '否', m.sort]);
    styleHeader(ms);

    const ps = wb.addWorksheet('参数');
    ps.columns = [
      { header: 'slug', width: 22 },
      { header: '参数键', width: 18 },
      { header: '中文参数名', width: 18 },
      { header: '英文参数名', width: 22 },
      { header: '中文值', width: 30 },
      { header: '英文值', width: 30 },
    ];
    for (const m of machines) for (const p of m.params) ps.addRow([m.slug, p.key, p.labelZh, p.labelEn, p.valueZh, p.valueEn]);
    styleHeader(ps);

    const cs = wb.addWorksheet('分类');
    cs.columns = [
      { header: '分类 slug', width: 18 },
      { header: '中文名', width: 18 },
      { header: '英文名', width: 30 },
    ];
    for (const c of categories) cs.addRow([c.slug, c.nameZh, c.nameEn]);
    styleHeader(cs);

    const help = wb.addWorksheet('说明');
    help.columns = [{ width: 110 }];
    [
      '导入规则',
      '1. 按「机型」表的 slug 匹配：已存在的机型会被更新，不存在的会新建（新建的机型没有图片，请到后台机型编辑页上传）。',
      '2. 导入不会删除任何机型；表格里没有的机型保持不变。',
      '3. 「分类」列填分类 slug，可选值见「分类」表。「状态」填 已上架 / 草稿 / 隐藏；「推荐」填 是 / 否；「排序」为整数，留空则保持原值（新建时排在分类末尾）。',
      '4. 「参数」表里出现的 slug，其参数会被整体替换为表中的行（顺序即显示顺序）；没有出现的机型参数不变。参数键为小写字母开头的英文、数字或下划线。',
      '5. slug 只能包含小写字母、数字和单个短横线，建议不要修改已有机型的 slug。',
      '6. 请保留表头和工作表名称。导入前后台会先检查，有任何错误都不会写入。导入后需在「发布中心」发布才会上线。',
    ].forEach((line, i) => {
      const r = help.addRow([line]);
      if (i === 0) r.font = { bold: true, size: 14 };
      r.alignment = { wrapText: true };
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private headerMap(ws: ExcelJS.Worksheet, cols: readonly string[], errors: ImportError[]) {
    const map = new Map<string, number>();
    ws.getRow(1).eachCell((cell, col) => map.set(text(cell), col));
    const missing = cols.filter((c) => !map.has(c));
    if (missing.length) errors.push({ sheet: ws.name, row: 1, message: `缺少列：${missing.join('、')}` });
    return map;
  }

  async importMachines(file: Buffer, dryRun: boolean, userId: string) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('无法读取文件，请上传从后台导出的 .xlsx 文件');
    }
    const errors: ImportError[] = [];
    const ms = wb.getWorksheet('机型');
    if (!ms) throw new BadRequestException('找不到「机型」工作表');
    const ps = wb.getWorksheet('参数');

    const [categories, existing] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slug: true } }),
      this.prisma.machine.findMany({ include: { category: { select: { slug: true } }, params: { orderBy: { sort: 'asc' } } } }),
    ]);
    const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const bySlug = new Map(existing.map((m) => [m.slug, m]));

    // --- 机型 sheet ---
    const mh = this.headerMap(ms, MACHINE_COLS, errors);
    const rows: Row[] = [];
    if (!errors.length) {
      const seen = new Set<string>();
      const get = (r: ExcelJS.Row, c: string) => text(r.getCell(mh.get(c)!));
      ms.eachRow((r, n) => {
        if (n === 1) return;
        const v = Object.fromEntries(MACHINE_COLS.map((c) => [c, get(r, c)])) as Record<(typeof MACHINE_COLS)[number], string>;
        if (Object.values(v).every((x) => !x)) return;
        const err = (message: string) => errors.push({ sheet: '机型', row: n, message });
        const before = errors.length;
        if (!SLUG_PATTERN.test(v.slug) || v.slug.length > 64) err(`slug「${v.slug}」格式不正确`);
        else if (seen.has(v.slug)) err(`slug「${v.slug}」重复`);
        seen.add(v.slug);
        if (!v['型号'] || v['型号'].length > 64) err('型号不能为空，且不超过 64 字');
        if (!catBySlug.has(v['分类'])) err(`分类「${v['分类']}」不存在`);
        if (!v['中文名称'] || v['中文名称'].length > 200) err('中文名称不能为空，且不超过 200 字');
        if (!v['英文名称'] || v['英文名称'].length > 200) err('英文名称不能为空，且不超过 200 字');
        const status = LABEL_STATUS.get(v['状态']);
        if (!status) err('状态应为 已上架 / 草稿 / 隐藏');
        if (v['推荐'] && v['推荐'] !== '是' && v['推荐'] !== '否') err('推荐应为 是 或 否');
        const sort = v['排序'] ? Number(v['排序']) : null;
        if (sort !== null && (!Number.isInteger(sort) || sort < 0 || sort > 1_000_000)) err('排序应为非负整数');
        if (errors.length === before) {
          rows.push({ slug: v.slug, model: v['型号'], category: v['分类'], nameZh: v['中文名称'], nameEn: v['英文名称'], status: status!, featured: v['推荐'] === '是', sort, row: n });
        }
      });
      if (rows.length + errors.length > MAX_ROWS) throw new BadRequestException(`一次最多导入 ${MAX_ROWS} 行`);
    }

    // --- 参数 sheet ---
    const paramsBySlug = new Map<string, Param[]>();
    if (ps && !errors.some((e) => e.row === 1)) {
      const ph = this.headerMap(ps, PARAM_COLS, errors);
      if (!errors.some((e) => e.sheet === '参数')) {
        const known = new Set([...rows.map((r) => r.slug), ...bySlug.keys()]);
        const get = (r: ExcelJS.Row, c: string) => text(r.getCell(ph.get(c)!));
        ps.eachRow((r, n) => {
          if (n === 1) return;
          const v = Object.fromEntries(PARAM_COLS.map((c) => [c, get(r, c)])) as Record<(typeof PARAM_COLS)[number], string>;
          if (Object.values(v).every((x) => !x)) return;
          const err = (message: string) => errors.push({ sheet: '参数', row: n, message });
          const before = errors.length;
          if (!known.has(v.slug)) err(`slug「${v.slug}」既不在「机型」表中，也不是已有机型`);
          if (!PARAM_KEY_PATTERN.test(v['参数键']) || v['参数键'].length > 64) err(`参数键「${v['参数键']}」格式不正确`);
          if (!v['中文参数名'] || v['中文参数名'].length > 100) err('中文参数名不能为空，且不超过 100 字');
          if (!v['英文参数名'] || v['英文参数名'].length > 100) err('英文参数名不能为空，且不超过 100 字');
          if (!v['中文值'] || v['中文值'].length > 500) err('中文值不能为空，且不超过 500 字');
          if (v['英文值'].length > 500) err('英文值不超过 500 字');
          const list = paramsBySlug.get(v.slug) ?? [];
          if (list.some((p) => p.key === v['参数键'])) err(`机型 ${v.slug} 的参数键「${v['参数键']}」重复`);
          if (list.length >= 100) err(`机型 ${v.slug} 的参数超过 100 个`);
          if (errors.length === before) {
            list.push({ key: v['参数键'], labelZh: v['中文参数名'], labelEn: v['英文参数名'], valueZh: v['中文值'], valueEn: v['英文值'] });
            paramsBySlug.set(v.slug, list);
          }
        });
      }
    }

    // --- diff ---
    const created: { slug: string; model: string }[] = [];
    const updated: { slug: string; model: string; fields: string[] }[] = [];
    let unchanged = 0;
    const touchedSlugs = new Set([...rows.map((r) => r.slug), ...paramsBySlug.keys()]);
    const rowBySlug = new Map(rows.map((r) => [r.slug, r]));
    for (const slug of touchedSlugs) {
      const r = rowBySlug.get(slug);
      const m = bySlug.get(slug);
      if (!m) {
        if (r) created.push({ slug, model: r.model });
        continue;
      }
      const fields: string[] = [];
      if (r) {
        if (r.model !== m.model) fields.push('型号');
        if (r.category !== m.category.slug) fields.push('分类');
        if (r.nameZh !== m.nameZh || r.nameEn !== m.nameEn) fields.push('名称');
        if (r.status !== m.status) fields.push('状态');
        if (r.featured !== m.featured) fields.push('推荐');
        if (r.sort !== null && r.sort !== m.sort) fields.push('排序');
      }
      const p = paramsBySlug.get(slug);
      if (p && !isDeepStrictEqual(p, m.params.map(({ key, labelZh, labelEn, valueZh, valueEn }) => ({ key, labelZh, labelEn, valueZh, valueEn })))) fields.push('参数');
      if (fields.length) updated.push({ slug, model: r?.model ?? m.model, fields });
      else unchanged++;
    }

    const result = { dryRun, applied: false, errors, created, updated, unchanged };
    if (dryRun || errors.length || (!created.length && !updated.length)) return result;

    await this.prisma.$transaction(
      async (tx) => {
        const maxSort = new Map<string, number>();
        for (const m of existing) maxSort.set(m.categoryId, Math.max(maxSort.get(m.categoryId) ?? 0, m.sort));
        const writeParams = async (machineId: string, list: Param[]) => {
          await tx.machineParam.deleteMany({ where: { machineId } });
          await tx.machineParam.createMany({ data: list.map((p, i) => ({ machineId, ...p, sort: (i + 1) * 10 })) });
        };
        for (const c of created) {
          const r = rowBySlug.get(c.slug)!;
          const categoryId = catBySlug.get(r.category)!;
          const sort = r.sort ?? (maxSort.get(categoryId) ?? 0) + 10;
          maxSort.set(categoryId, Math.max(maxSort.get(categoryId) ?? 0, sort));
          const m = await tx.machine.create({
            data: { slug: r.slug, model: r.model, modelKey: compactModel(r.model), categoryId, nameZh: r.nameZh, nameEn: r.nameEn, status: r.status, featured: r.featured, sort },
          });
          const p = paramsBySlug.get(c.slug);
          if (p) await writeParams(m.id, p);
        }
        for (const u of updated) {
          const m = bySlug.get(u.slug)!;
          const r = rowBySlug.get(u.slug);
          if (r) {
            const data: Prisma.MachineUncheckedUpdateInput = {
              model: r.model,
              modelKey: compactModel(r.model),
              categoryId: catBySlug.get(r.category)!,
              nameZh: r.nameZh,
              nameEn: r.nameEn,
              status: r.status,
              featured: r.featured,
            };
            if (r.sort !== null) data.sort = r.sort;
            await tx.machine.update({ where: { id: m.id }, data });
          }
          if (u.fields.includes('参数')) await writeParams(m.id, paramsBySlug.get(u.slug)!);
        }
      },
      { timeout: 60_000 },
    );
    await this.audit.log({
      userId,
      action: 'import',
      entity: 'import',
      diff: { created: created.map((c) => c.slug), updated: updated.map((u) => ({ slug: u.slug, fields: u.fields })) },
    });
    return { ...result, applied: true };
  }
}
