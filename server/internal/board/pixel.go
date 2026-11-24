// Package board describes the world (pixels, chunks, palette) and its Redis storage.
package board

import (
	"encoding/json"
	"slices"
	"strconv"
)

// World geometry.
const (
	ChunkShift = 8 // a chunk is 2^8 = 256 pixels wide
	ChunkSize  = 1 << ChunkShift
	// The world is 16:9 and centred on 0, 0: x in [-640, 640), y in [-360, 360).
	// Edges do not fall on chunk boundaries: border chunks are partly outside.
	WorldWidth  = 1280
	WorldHeight = 720
)

// PaletteRows are displayed as-is by the front: neutrals, then light, vivid and dark rows aligned by hue
// (red, orange, yellow, green, turquoise, blue, purple, pink), then earth tones.
// A colour's index is its position once the rows are concatenated. Index 0 = white = never
// painted. Never reorder: bytes already in Redis point to these indexes. Append new colours.
var PaletteRows = [][]string{
	{"#FFFFFF", "#CDCDCD", "#9C9C9C", "#696969", "#373737", "#000000"},
	{"#FF8A80", "#FFA878", "#FFF3A3", "#A8E89A", "#A6EEF0", "#90C4FF", "#D4A8F5", "#FFB3D9"},
	{"#E52521", "#FF8A1F", "#FFE135", "#2ECC40", "#00B8B8", "#1F5BFF", "#8A2BE2", "#FF4FA3"},
	{"#7A1520", "#B8400C", "#7F8020", "#1E6B32", "#0A5F70", "#1E2F7A", "#5E1A6E", "#A3195B"},
	{"#EDCB9A", "#C9A06A", "#A0703F", "#6B4128", "#4E2408"},
}

// Palette holds every colour, flattened in index order.
var Palette = slices.Concat(PaletteRows...)

// Pixel is a world position and a palette colour index.
type Pixel struct {
	X int `json:"x"`
	Y int `json:"y"`
	C int `json:"c"`
}

// ParsePixel decodes a pixel sent by a client. All three fields are required (`{}` must not
// mean "white pixel at 0, 0") and the pixel must be valid.
func ParsePixel(data []byte) (Pixel, bool) {
	var m struct{ X, Y, C *int }
	if json.Unmarshal(data, &m) != nil || m.X == nil || m.Y == nil || m.C == nil {
		return Pixel{}, false
	}
	p := Pixel{*m.X, *m.Y, *m.C}
	return p, p.Valid()
}

// InWorld reports whether the point lies within the world bounds.
func InWorld(x, y int) bool {
	return x >= -WorldWidth/2 && x < WorldWidth/2 && y >= -WorldHeight/2 && y < WorldHeight/2
}

// Valid reports whether the pixel is in the world and uses a palette colour.
func (p Pixel) Valid() bool {
	return InWorld(p.X, p.Y) && p.C >= 0 && p.C < len(Palette)
}

// ChunkInWorld reports whether chunk (cx, cy) contains world pixels.
func ChunkInWorld(cx, cy int) bool {
	overlaps := func(c, size int) bool { return c*ChunkSize < size/2 && (c+1)*ChunkSize > -size/2 }
	return overlaps(cx, WorldWidth) && overlaps(cy, WorldHeight)
}

// ChunkID returns the "cx:cy" chunk identifier used in Redis keys.
func ChunkID(cx, cy int) string { return strconv.Itoa(cx) + ":" + strconv.Itoa(cy) }

// Locate returns a pixel's chunk and its byte offset within that chunk.
// Arithmetic shifts round towards -∞: x = -1 lands in chunk -1, offset 255.
func Locate(x, y int) (id string, offset int64) {
	return ChunkID(x>>ChunkShift, y>>ChunkShift), int64((y&(ChunkSize-1))*ChunkSize + x&(ChunkSize-1))
}
