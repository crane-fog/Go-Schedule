package note

import "schedule/internal/openapi"

type Store interface {
	GetNotes() ([]openapi.Note, error)
	CreateNote(note *openapi.CreateNoteRequest) (*openapi.Note, error)
	UpdateNoteMeta(id int64, req *openapi.UpdateNoteMetaRequest) (*openapi.NoteMeta, error)
	UpdateNoteContent(id int64, req *openapi.UpdateNoteContentRequest) (*openapi.Note, error)
	DeleteNote(id int64) error
}
