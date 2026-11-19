package note

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"

	"schedule/internal/openapi"
)

type NoteService struct {
	store     Store
	imagePath string
}

func NewNoteService(store Store, imagePath string) *NoteService {
	return &NoteService{
		store:     store,
		imagePath: imagePath,
	}
}

func (s *NoteService) GetNotes() ([]openapi.Note, error) {
	return s.store.GetNotes()
}

func (s *NoteService) CreateNote(req *openapi.CreateNoteRequest) (*openapi.Note, error) {
	if err := validateTitle(req.Title); err != nil {
		return nil, err
	}
	return s.store.CreateNote(req)
}

func (s *NoteService) UpdateNoteMeta(id int64, req *openapi.UpdateNoteMetaRequest) (*openapi.NoteMeta, error) {
	if id < 1 {
		return nil, badRequest("Invalid note ID")
	}
	if err := validateTitle(req.Title); err != nil {
		return nil, err
	}
	result, err := s.store.UpdateNoteMeta(id, req)
	if err != nil {
		return nil, mapStoreError(err)
	}
	return result, nil
}

func (s *NoteService) UpdateNoteContent(id int64, req *openapi.UpdateNoteContentRequest) (*openapi.Note, error) {
	if id < 1 {
		return nil, badRequest("Invalid note ID")
	}
	result, err := s.store.UpdateNoteContent(id, req)
	if err != nil {
		return nil, mapStoreError(err)
	}
	return result, nil
}

func (s *NoteService) DeleteNote(id int64) (*openapi.DeleteScheduleResponseData, error) {
	if id < 1 {
		return nil, badRequest("Invalid note ID")
	}
	if err := s.store.DeleteNote(id); err != nil {
		return nil, mapStoreError(err)
	}
	return &openapi.DeleteScheduleResponseData{Id: id}, nil
}

func (s *NoteService) SaveImage(fileHeader *multipart.FileHeader) (*openapi.NoteImageData, error) {
	if fileHeader == nil {
		return nil, badRequest("缺少上传图片文件")
	}
	ext, err := validateImageExt(fileHeader.Filename)
	if err != nil {
		return nil, err
	}
	filename, err := generateImageFilename(ext)
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(s.imagePath, 0o755); err != nil {
		return nil, fmt.Errorf("创建图片目录失败: %w", err)
	}

	src, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("打开上传文件失败: %w", err)
	}
	defer src.Close()

	fullPath := filepath.Join(s.imagePath, filename)
	dst, err := os.Create(fullPath)
	if err != nil {
		return nil, fmt.Errorf("创建图片文件失败: %w", err)
	}

	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(fullPath)
		return nil, fmt.Errorf("保存图片文件失败: %w", err)
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(fullPath)
		return nil, fmt.Errorf("写入图片文件失败: %w", err)
	}

	return &openapi.NoteImageData{
		Filename: filename,
		Url:      "/api/v1/notes/images/" + filename,
	}, nil
}

func (s *NoteService) GetImagePath(filename string) (string, error) {
	cleanName := filepath.Base(filename)
	if cleanName == "" || cleanName == "." || cleanName == ".." || cleanName != filename {
		return "", notFound("图片不存在")
	}
	fullPath := filepath.Join(s.imagePath, cleanName)
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		return "", notFound("图片不存在")
	}
	return fullPath, nil
}
