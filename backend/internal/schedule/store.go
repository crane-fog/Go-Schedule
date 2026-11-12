package schedule

import "schedule/internal/openapi"

type Store interface {
	GetSchedules() ([]openapi.Schedule, error)
	CreateSchedule(schedule *openapi.CreateScheduleRequest) (*openapi.Schedule, error)
	UpdateSchedule(id int64, schedule *openapi.UpdateScheduleRequest) (*openapi.Schedule, error)
	DeleteSchedule(id int64) error
}
