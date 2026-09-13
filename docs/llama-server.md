# Running llama-server

The app writes prompts through a local llama-server. It never starts or
stops one: it attaches to a URL, asks what models the server has, names one
on every request, and can free a loaded model to hand the card to something
else.

## What the app needs

1. A llama-server answering at a URL, `http://127.0.0.1:8080` by default.
2. A model chosen in Settings. A request that names no model is refused by
   the server, so Generate refuses before it calls one.

Open Settings with the gear in the workspace header, press Check, choose a
model from the list, and press Save. Check asks the server what it can
serve; until it has been pressed the list is empty.

## Router mode

One server hosts every model it can find and loads one on demand, so the app
never needs it started a particular way:

```
pnpm llama
```

which runs:

```
llama-server \
  --models-dir ~/.cache/huggingface/hub \
  --models-max 1 \
  --mmproj-device none \
  --host 127.0.0.1 --port 8080
```

- `--models-dir` is read alongside the HuggingFace cache, so anything pulled
  with `-hf` before is already listed.
- `--models-max 1` keeps one model in memory at a time, which is what an 8GB
  card wants.
- `--mmproj-device none` keeps the vision projector off the GPU. On this
  machine an image encode aborted inside CUDA with the projector on the card
  while another model held VRAM.

A model is loaded when a request first names it, by starting a child
llama-server and proxying to it. Killing the router kills the children.

## One model at a time

A plain single-model server works too, and the app reads its model list the
same way:

```
llama-server -hf unsloth/Qwen3.5-9B-GGUF:Q4_K_M --no-mmproj -c 8192 --port 8080
```

The first run downloads about 5.7GB into the HuggingFace cache. `--no-mmproj`
leaves the vision projector out, which is what to use while nothing needs to
see pictures.

## Checking it by hand

```
curl http://127.0.0.1:8080/health          # {"status":"ok"}
curl http://127.0.0.1:8080/v1/models       # ids, and in router mode their state
```

In router mode a model reports `loaded` or `unloaded`, and
`curl -X POST http://127.0.0.1:8080/models/unload -d '{"model":"<id>"}'`
frees one. Unload in the settings dialog does the same thing.

## When it will not write

| What you see                                                | What it means                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Choose a model in settings before writing a prompt          | Settings holds no model. Press Check, choose one, Save.                                                         |
| No answer at that URL                                       | Nothing is listening there. Start the server, or correct the URL.                                               |
| The server is still loading its model                       | It is up but not ready. Try again in a moment.                                                                  |
| llama-server answered with something the app could not read | The model broke the schema it was given, or the URL points at something that is not llama-server.               |
| No answer from llama-server at ... after two minutes        | A generation ran past the two minute limit. The message says unreachable, which is wrong, and is a known issue. |
