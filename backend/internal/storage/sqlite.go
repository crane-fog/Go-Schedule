package storage

import (
	"errors"
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

func (store *Store) CreateSchedule(req *openapi.CreateScheduleRequest) (*openapi.Schedule, error) {
	s := Schedules{Schedule: openapi.Schedule{
		Title:       req.Title,
		Description: req.Description,
		Type:        req.Type,
		Priority:    req.Priority,
		Done:        false,
		HappenTime:  req.HappenTime,
		StartAt:     req.StartAt,
		EndAt:       req.EndAt,
		Recurrence:  req.Recurrence,
	}}
	if err := store.db.Create(&s).Error; err != nil {
		return nil, err
	}
	return &s.Schedule, nil
}

func (store *Store) UpdateSchedule(id int64, req *openapi.UpdateScheduleRequest) (*openapi.Schedule, error) {
	var s Schedules
	if err := store.db.First(&s, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	s.Title = req.Title
	s.Description = req.Description
	s.Type = req.Type
	s.Priority = req.Priority
	s.Done = req.Done
	s.HappenTime = req.HappenTime
	s.StartAt = req.StartAt
	s.EndAt = req.EndAt
	s.Schedule.Recurrence = req.Recurrence
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
		return ErrNotFound
	}
	return nil
}
