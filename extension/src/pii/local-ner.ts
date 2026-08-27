import type { PiiMatch } from "../shared/types";

type NerToken = Readonly<{ entity: string; score: number; word: string }>;

export function personMatchesFromNerOutput(text: string, entities: readonly NerToken[]): PiiMatch[] {
  const names: { value: string; score: number }[] = [];
  let current: { value: string; score: number } | undefined;
  const flush = (): void => { if (current) names.push(current); current = undefined; };
  for (const entity of entities) {
    const isPerson = /(?:B|I)-PER$/i.test(entity.entity);
    if (!isPerson) { flush(); continue; }
    const fragment = entity.word.replace(/^##/, "").trim();
    const continues = Boolean(current && (entity.word.startsWith("##") || /^I-/i.test(entity.entity)));
    if (!continues) flush();
    current = current
      ? { value: `${current.value}${entity.word.startsWith("##") ? "" : " "}${fragment}`, score: Math.min(current.score, entity.score) }
      : { value: fragment, score: entity.score };
  }
  flush();
  let cursor = 0;
  return names.flatMap((entity) => {
    if (entity.score < 0.8) return [];
    const value = entity.value.replace(/\s+/g, " ").trim();
    const start = text.toLocaleLowerCase().indexOf(value.toLocaleLowerCase(), cursor);
    if (start < 0 || !value) return [];
    cursor = start + value.length;
    return [{ category: "PERSON_NAME" as const, value, start, end: cursor, confidence: entity.score }];
  });
}

/**
 * Local-only named-entity recognition for names that cannot be identified by
 * structured PII rules. The quantized model is deliberately a packaged asset;
 * raw page text is an inference input in this browser process only.
 */
export class LocalNerBackend {
  private classifier?: import("@huggingface/transformers").TokenClassificationPipeline;
  private attempted = false;
  runtime: "webgpu" | "wasm" | "unavailable" = "unavailable";

  async recognize(text: string): Promise<PiiMatch[]> {
    if (!text.trim()) return [];
    await this.load();
    if (!this.classifier) return [];
    try {
      const entities = await this.classifier(text, { ignore_labels: [] });
        // The prepared local TinyBERT model is trained on CoNLL-2003. Only people are
      // treated as sensitive by default; place/organisation labels remain
      // visible unless a DOM privacy rule classifies the field as an address.
      return personMatchesFromNerOutput(text, entities);
    } catch {
      // No retries with a remote model: unavailable local ML simply yields to
      // the deterministic recognizers and DOM/ARIA safety rules.
      return [];
    }
  }

  private async load(): Promise<void> {
    if (this.attempted) return;
    this.attempted = true;
    try {
      const { browser } = await import("wxt/browser");
      const root = (browser.runtime as unknown as { getURL(path: string): string }).getURL("models/");
      const probe = await fetch(`${root}ner/config.json`);
      if (!probe.ok) return;
      // This is deliberately an extension asset rather than a normal package
      // import. It keeps the optional NER runtime out of the always-on MV3
      // worker bundle and, more importantly, gives it no network model path.
      const runtimeUrl = (browser.runtime as unknown as { getURL(path: string): string })
        .getURL("models/ner-runtime/transformers.web.min.mjs");
      const runtimeProbe = await fetch(runtimeUrl);
      if (!runtimeProbe.ok) return;
      const { env, pipeline } = await import(/* @vite-ignore */ runtimeUrl) as Pick<typeof import("@huggingface/transformers"), "env" | "pipeline">;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = root;
      try {
        this.classifier = await pipeline("token-classification", "ner", { local_files_only: true, device: "webgpu", model_file_name: "model_quantized" });
        this.runtime = "webgpu";
      } catch {
        this.classifier = await pipeline("token-classification", "ner", { local_files_only: true, device: "wasm", model_file_name: "model_quantized" });
        this.runtime = "wasm";
      }
    } catch {
      this.classifier = undefined;
      this.runtime = "unavailable";
    }
  }
}
