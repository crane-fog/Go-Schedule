package note

import "schedule/internal/openapi"

type Store interface {
	GetNotes() ([]openapi.Note, error)
	CreateNote(note *openapi.CreateNoteRequest) (*openapi.Note, error)
	UpdateNote(id int64, note *openapi.UpdateNoteRequest) (*openapi.Note, error)
	DeleteNote(id int64) error
}
