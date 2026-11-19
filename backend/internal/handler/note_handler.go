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
	UpdateNote(id int64, req *openapi.UpdateNoteRequest) (*openapi.Note, error)
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
		notes.PUT("/:id", h.UpdateNote)
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

func (h *NoteHandler) UpdateNote(c *gin.Context) {
	var req openapi.UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeErrorWithCode(c, 400, "Invalid request")
		return
	}
	idStr := c.Param("id")
	if idStr == "" {
		writeErrorWithCode(c, 400, "Missing note ID")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErrorWithCode(c, 400, "Invalid note ID format")
		return
	}
	data, err := h.noteService.UpdateNote(id, &req)
	if err != nil {
		writeError(c, err)
		return
	}
	writeJSON(c, openapi.NoteResponse{Code: 200, Data: *data})
}

func (h *NoteHandler) DeleteNote(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		writeErrorWithCode(c, 400, "Missing note ID")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErrorWithCode(c, 400, "Invalid note ID format")
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
	c.File(fullPath)
}
