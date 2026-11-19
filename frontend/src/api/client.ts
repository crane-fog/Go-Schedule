import {
  Configuration,
  NotesApi,
  SchedulesApi,
  type CreateNoteRequest,
  type CreateScheduleRequest,
  type ErrorResponse,
  type Note,
  type NoteImageData,
  type NoteMeta,
  type Schedule,
  type UpdateNoteContentRequest,
  type UpdateNoteMetaRequest,
  type UpdateScheduleRequest,
} from './index'

type ApiEnvelope<TData> = { code: 200; data: TData } | ErrorResponse

const apiConfiguration = new Configuration({
  basePath: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
})

const schedulesApi = new SchedulesApi(apiConfiguration)
const notesApi = new NotesApi(apiConfiguration)

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

export async function fetchNotes(): Promise<Note[]> {
  const data = await requestApi(
    () => notesApi.listNotes(),
    '获取记事列表失败，请检查后端服务是否已启动',
  )
  return data ?? []
}

export async function createNoteItem(req: CreateNoteRequest): Promise<Note> {
  return requestApi(() => notesApi.createNote({ createNoteRequest: req }), '创建记事页签失败')
}

export async function updateNoteMetaItem(
  id: number,
  req: UpdateNoteMetaRequest,
): Promise<NoteMeta> {
  return requestApi(
    () => notesApi.updateNoteMeta({ id, updateNoteMetaRequest: req }),
    '保存记事页签元信息失败',
  )
}

export async function updateNoteContentItem(
  id: number,
  req: UpdateNoteContentRequest,
): Promise<Note> {
  return requestApi(
    () => notesApi.updateNoteContent({ id, updateNoteContentRequest: req }),
    '保存记事正文失败',
  )
}

export async function deleteNoteItem(id: number): Promise<number> {
  const data = await requestApi(() => notesApi.deleteNote({ id }), '删除记事页签失败')
  return data.id
}

export async function uploadNoteImage(file: File): Promise<NoteImageData> {
  return requestApi(() => notesApi.uploadNoteImage({ file }), '上传图片失败')
}
