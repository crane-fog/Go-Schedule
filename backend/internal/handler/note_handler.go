package handler

import (
	"mime/multipart"
	"net/http"
	"strconv"

	"schedule/internal/openapi"

	"github.com/gin-gonic/gin"
)

type NoteService interface {
	GetNotes() ([]openapi.Note, error)
	CreateNote(req *openapi.CreateNoteRequest) (*openapi.Note, error)
	UpdateNoteMeta(id int64, req *openapi.UpdateNoteMetaRequest) (*openapi.NoteMeta, error)
	UpdateNoteContent(id int64, req *openapi.UpdateNoteContentRequest) (*openapi.Note, error)
	DeleteNote(id int64) (*openapi.DeleteScheduleResponseData, error)
	SaveImage(file *multipart.FileHeader) (*openapi.NoteImageData, error)
	GetImagePath(filename string) (string, error)
}

type NoteHandler struct {
	noteService NoteService
}

func NewNoteHandler(s NoteService) *NoteHandler {
	return &NoteHandler{noteService: s}
}

func (h *NoteHandler) RegisterRoutes(rg *gin.RouterGroup) {
	notes := rg.Group("/notes")
	{
		notes.GET("", h.GetNotes)
		notes.POST("", h.CreateNote)
		notes.PUT("/:id/meta", h.UpdateNoteMeta)
		notes.PUT("/:id/content", h.UpdateNoteContent)
		notes.DELETE("/:id", h.DeleteNote)
		notes.POST("/images", h.UploadNoteImage)
		notes.GET("/images/:filename", h.GetNoteImage)
	}
}

func (h *NoteHandler) GetNotes(c *gin.Context) {
	result, err := h.noteService.GetNotes()
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteListResponse{Code: 200, Data: result})
}

func (h *NoteHandler) CreateNote(c *gin.Context) {
	var req openapi.CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	data, err := h.noteService.CreateNote(&req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteResponse{Code: 200, Data: *data})
}

func parseNoteID(c *gin.Context) (int64, bool) {
	idStr := c.Param("id")
	if idStr == "" {
		writeErrorWithCode(c, 400, "Missing note ID")
		return 0, false
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErrorWithCode(c, 400, "Invalid note ID format")
		return 0, false
	}
	return id, true
}

func (h *NoteHandler) UpdateNoteMeta(c *gin.Context) {
	var req openapi.UpdateNoteMetaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	id, ok := parseNoteID(c)
	if !ok {
		return
	}
	data, err := h.noteService.UpdateNoteMeta(id, &req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteMetaResponse{Code: 200, Data: *data})
}

func (h *NoteHandler) UpdateNoteContent(c *gin.Context) {
	var req openapi.UpdateNoteContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	id, ok := parseNoteID(c)
	if !ok {
		return
	}
	data, err := h.noteService.UpdateNoteContent(id, &req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteResponse{Code: 200, Data: *data})
}

func (h *NoteHandler) DeleteNote(c *gin.Context) {
	id, ok := parseNoteID(c)
	if !ok {
		return
	}
	data, err := h.noteService.DeleteNote(id)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.DeleteNoteResponse{Code: 200, Data: *data})
}

func (h *NoteHandler) UploadNoteImage(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		writeErrorWithCode(c, 400, "缺少上传图片文件")
		return
	}
	data, err := h.noteService.SaveImage(file)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteImageUploadResponse{Code: 200, Data: *data})
}

func (h *NoteHandler) GetNoteImage(c *gin.Context) {
	filename := c.Param("filename")
	fullPath, err := h.noteService.GetImagePath(filename)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.File(fullPath)
}
