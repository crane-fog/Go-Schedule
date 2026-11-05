package storage

import (
	"schedule/internal/openapi"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type Store struct {
	db *gorm.DB
}

func NewSQLiteStore(path string) (*Store, error) {
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	err = db.AutoMigrate(&Schedules{})
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	db, err := s.db.DB()
	if err != nil {
		return err
	}
	return db.Close()
}

func (store *Store) GetSchedules() ([]openapi.Schedule, error) {
	var schedules []Schedules
	if err := store.db.Find(&schedules).Error; err != nil {
		return nil, err
	}

	result := make([]openapi.Schedule, len(schedules))
	for i, s := range schedules {
		result[i] = s.Schedule
	}
	return result, nil
}

func (store *Store) CreateSchedule(schedule *openapi.CreateScheduleRequest) (*openapi.Schedule, error) {
	s := Schedules{Schedule: openapi.Schedule{
		Title: schedule.Title,
		Type: schedule.Type,
		Priority: schedule.Priority,
		Done: false,
		HappenTime: schedule.HappenTime,
		StartAt: schedule.StartAt,
		EndAt: schedule.EndAt,
		Recurrence: schedule.Recurrence,
	}}
	if err := store.db.Create(&s).Error; err != nil {
		return nil, err
	}
	return &s.Schedule, nil
}

func (store *Store) UpdateSchedule(id int64, schedule *openapi.UpdateScheduleRequest) (*openapi.Schedule, error) {
	var s Schedules
	if err := store.db.First(&s, id).Error; err != nil {
		return nil, err
	}
	s.Title = schedule.Title
	s.Type = schedule.Type
	s.Priority = schedule.Priority
	s.Done = schedule.Done
	s.HappenTime = schedule.HappenTime
	s.StartAt = schedule.StartAt
	s.EndAt = schedule.EndAt
	s.Schedule.Recurrence = schedule.Recurrence
	if err := store.db.Save(&s).Error; err != nil {
		return nil, err
	}
	return &s.Schedule, nil
}

func (store *Store) DeleteSchedule(id int64) error {
	result := store.db.Delete(&Schedules{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
