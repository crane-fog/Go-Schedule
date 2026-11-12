import {
  Configuration,
  SchedulesApi,
  type CreateScheduleRequest,
  type Schedule,
  type UpdateScheduleRequest,
} from './index'

export const schedulesApi = new SchedulesApi(
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

export async function fetchSchedules(): Promise<Schedule[]> {
  try {
    const response = await schedulesApi.listSchedules()
    if (response.data.code === 200) {
      return response.data.data ?? []
    }
    throw new Error(response.data.data.message || '获取日程列表失败')
  } catch (err) {
    throw new Error(extractErrorMessage(err, '获取日程列表失败，请检查后端服务是否已启动'), {
      cause: err,
    })
  }
}

export async function createScheduleItem(req: CreateScheduleRequest): Promise<Schedule> {
  try {
    const response = await schedulesApi.createSchedule({
      createScheduleRequest: req,
    })
    if (response.data.code === 200) {
      return response.data.data
    }
    throw new Error(response.data.data.message || '创建日程失败')
  } catch (err) {
    throw new Error(extractErrorMessage(err, '创建日程失败'), { cause: err })
  }
}

export async function updateScheduleItem(
  id: number,
  req: UpdateScheduleRequest,
): Promise<Schedule> {
  try {
    const response = await schedulesApi.updateSchedule({
      id,
      updateScheduleRequest: req,
    })
    if (response.data.code === 200) {
      return response.data.data
    }
    throw new Error(response.data.data.message || '更新日程失败')
  } catch (err) {
    throw new Error(extractErrorMessage(err, '更新日程失败'), { cause: err })
  }
}

export async function deleteScheduleItem(id: number): Promise<number> {
  try {
    const response = await schedulesApi.deleteSchedule({ id })
    if (response.data.code === 200) {
      return response.data.data.id
    }
    throw new Error(response.data.data.message || '删除日程失败')
  } catch (err) {
    throw new Error(extractErrorMessage(err, '删除日程失败'), { cause: err })
  }
}
