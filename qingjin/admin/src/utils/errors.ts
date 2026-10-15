import axios from 'axios'

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

/** ElMessageBox rejects with 'cancel' / 'close' when the user dismisses it. */
export function isDismissed(error: unknown): boolean {
  return error === 'cancel' || error === 'close'
}
