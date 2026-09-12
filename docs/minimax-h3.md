# MiniMax H3 documentation

The app writes prompts for MiniMax H3. Its documentation is linked here
rather than copied into this repository. The MiniMax H3 Community License
Agreement grants rights only within an Applicable Territory that excludes
the United Kingdom, the European Union, the Republic of Korea and the United
States, and it forbids placing different terms on the material. Neither fits
a public MIT repository.

- [Prompt writing guide, base forms][base] covers T2VA, I2VA, FL2VA and
  L2VA: the three core fields, the instruction line the keyframe forms open
  with, the camera vocabulary, speakers and dialogue.
- [Prompt writing guide, full reference][ref] covers full-reference mode,
  where pictures, video and audio are given labels the prompt refers to. Its
  output is six sections rather than three, and its main field is called
  `detailed_description` rather than `integrated_multimodal_description`.
- [Request scripts][scripts] show what a generation request carries.
- [The licence][licence] sets out the territory and the use restrictions.

`docs/h3-mapping.md` holds what the app took from the guides, written out
here. The four instruction lines a keyframe form opens with are quoted in
`src/main/core/prompting/targets/minimax-h3.ts`, because they are the input
H3 expects and the output stops working if the wording drifts.

[base]: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
[ref]: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md
[scripts]: https://huggingface.co/MiniMaxAI/MiniMax-H3/tree/main/scripts/readme
[licence]: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE
