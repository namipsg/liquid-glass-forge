# Local video fixture

`red-blue.mp4` is an original synthetic 16×16 H.264/yuv420p fixture: one second
of red, then one second of blue, 10 fps, no audio. It contains no external assets.
Video tests compare provider bytes exactly with native Canvas2D readback and
check independent red/blue frame identity. Cross-engine decoder/color-management
conversions differ from ideal RGB primaries; optical tolerances are unchanged. Runtime tests need no ffmpeg.

Generation (ffmpeg with libx264):

```sh
ffmpeg -f lavfi -i 'color=c=red:s=16x16:r=10:d=1' \
  -f lavfi -i 'color=c=blue:s=16x16:r=10:d=1' \
  -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0,scale=in_color_matrix=bt601:out_color_matrix=bt709[v]' -map '[v]' \
  -c:v libx264 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 \
  -colorspace bt709 -color_range tv -movflags +faststart red-blue.mp4
```

`red-blue-wide.mp4` uses the same content at 32×16 with square pixels, to test
actual source dimension changes (pixel aspect ratio must not compensate the resize):

```sh
ffmpeg -i red-blue.mp4 -vf 'scale=32:16,setsar=1' -c:v libx264 \
  -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -color_range tv -movflags +faststart red-blue-wide.mp4
```
