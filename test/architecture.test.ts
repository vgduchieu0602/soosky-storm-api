import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const SOURCE_ROOT = new URL("../src/", import.meta.url);
const DOMAIN_ROOT = new URL("domain/", SOURCE_ROOT);
const APPLICATION_ROOT = new URL("application/", SOURCE_ROOT);

/**
 * Imports are matched per line: every import under `src/` is written on one
 * line, so this never has to parse TypeScript, and a `from "..."` inside a
 * string literal can never be mistaken for an import.
 */
const IMPORT_LINE = /^\s*(?:import|export)\b.*\bfrom\s+"([^"]+)"/;
const SIDE_EFFECT_IMPORT_LINE = /^\s*import\s+"([^"]+)"/;

interface SourceImport {
    readonly file: URL;
    readonly label: string;
    readonly specifier: string;
}

test("domain does not import anything outside domain", async () => {
    for (const entry of await readImports(DOMAIN_ROOT)) {
        assertRelative(entry);
        assertStaysInside(entry, [DOMAIN_ROOT]);
    }
});

test("application imports only domain and other application code", async () => {
    for (const entry of await readImports(APPLICATION_ROOT)) {
        assertRelative(entry);
        assertStaysInside(entry, [DOMAIN_ROOT, APPLICATION_ROOT]);
    }
});

/**
 * A framework, driver, or provider SDK reaches the inner layers as a bare
 * specifier, so relative-only is the whole rule. Node builtins are exempt:
 * they are the language runtime, not an infrastructure choice.
 */
function assertRelative ({ label, specifier }: SourceImport): void {
    assert.ok(
        specifier.startsWith(".") || specifier.startsWith("node:"),
        label + " imports the package [" + specifier + "]. Inner layers stay framework-independent.",
    );
}

function assertStaysInside ({ file, label, specifier }: SourceImport, roots: URL[]): void {
    if (specifier.startsWith("node:")) {
        return;
    }

    const target = new URL(specifier, file).href;

    assert.ok(
        roots.some((root) => target.startsWith(root.href)),
        label + " imports [" + specifier + "], which points outward. Dependencies point inward: "
        + "adapters, http, scheduler, composition, and config are off limits.",
    );
}

async function readImports (root: URL): Promise<SourceImport[]> {
    const names = await readdir(root, { recursive: true });
    const imports: SourceImport[] = [];

    for (const name of names) {
        if (!name.endsWith(".ts")) {
            continue;
        }

        const file = new URL(name.replaceAll("\\", "/"), root);
        const label = file.href.slice(SOURCE_ROOT.href.length);
        const source = await readFile(file, "utf-8");

        for (const line of source.split("\n")) {
            const specifier = IMPORT_LINE.exec(line)?.[1] ?? SIDE_EFFECT_IMPORT_LINE.exec(line)?.[1];

            if (specifier) {
                imports.push({ file, label, specifier });
            }
        }
    }

    return imports;
}

