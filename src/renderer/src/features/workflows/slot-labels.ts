import type { SlotKind, SlotTier } from "@renderer/lib/trpc"

/** What each kind of slot takes, in words. */
export const KIND_LABELS: Record<SlotKind, string> = {
  text: "Text",
  integer: "Whole number",
  number: "Number",
  boolean: "On or off",
  image: "Image",
  audio: "Audio",
  seed: "Seed",
  lora: "LoRA stack",
  toggle: "Bypass switch",
}

/** The tiers in the order the mapping shows them, with what each is called. */
export const TIERS: { tier: SlotTier; label: string }[] = [
  { tier: "basic", label: "Basic" },
  { tier: "advanced", label: "Advanced" },
  { tier: "hidden", label: "Hidden" },
]
