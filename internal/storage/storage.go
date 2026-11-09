package storage

import (
	"errors"
	"schedule/internal/openapi"
)

type Schedules struct {
	openapi.Schedule
}

var ErrNotFound = errors.New("resource not found")
