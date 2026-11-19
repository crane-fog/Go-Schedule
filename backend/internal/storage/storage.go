package storage

import (
	"errors"
	"schedule/internal/openapi"
)

type Schedules struct {
	openapi.Schedule
}

type Notes struct {
	openapi.Note
}

var ErrNotFound = errors.New("resource not found")
