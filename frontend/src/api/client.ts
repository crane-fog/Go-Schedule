import {
  Configuration,
  SchedulesApi,
  type CreateScheduleRequest,
  type ErrorResponse,
  type Schedule,
  type UpdateScheduleRequest,
} from './index'

type ApiEnvelope<TData> = { code: 200; data: TData } | ErrorResponse

const schedulesApi = new SchedulesApi(
  new Configuration({
    basePath: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
  }),
)

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}

async function requestApi<TData>(
  request: () => Promise<{ data: ApiEnvelope<TData> }>,
  fallbackMessage: string,
): Promise<TData> {
  try {
    const { data: body } = await request()
    if (body.code === 200) {
      return body.data
    }
    throw new Error(body.data.message || fallbackMessage)
  } catch (err) {
    throw new Error(extractErrorMessage(err, fallbackMessage), { cause: err })
  }
}

export async function fetchSchedules(): Promise<Schedule[]> {
  const data = await requestApi(
    () => schedulesApi.listSchedules(),
    '获取日程列表失败，请检查后端服务是否已启动',
  )
  return data ?? []
}

export async function createScheduleItem(req: CreateScheduleRequest): Promise<Schedule> {
  return requestApi(
    () => schedulesApi.createSchedule({ createScheduleRequest: req }),
    '创建日程失败',
  )
}

export async function updateScheduleItem(
  id: number,
  req: UpdateScheduleRequest,
): Promise<Schedule> {
  return requestApi(
    () => schedulesApi.updateSchedule({ id, updateScheduleRequest: req }),
    '更新日程失败',
  )
}

export async function deleteScheduleItem(id: number): Promise<number> {
  const data = await requestApi(() => schedulesApi.deleteSchedule({ id }), '删除日程失败')
  return data.id
}
