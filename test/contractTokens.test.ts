import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * M31 (proposal section 18's guard): the contract types other modules see (each service's service.ts, the steps
 * API, cues, outcomes, the request core) never name a canvas Token: only TokenDocuments cross the contract.
 */

const root = path.resolve(__dirname, "../src/module");
const contractFiles = [
  ...fs.readdirSync(path.join(root, "services"), { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => path.join(root, "services", e.name, "service.ts")).filter(f => fs.existsSync(f)),
  ...fs.readdirSync(path.join(root, "steps")).filter(f => f.endsWith(".ts")).map(f => path.join(root, "steps", f)),
  path.join(root, "lib", "cues.ts"),
  path.join(root, "lib", "outcomes.ts"),
  path.join(root, "lib", "requests.ts")
].filter(f => fs.existsSync(f));

const CANVAS_TOKEN = /(^|[^\w.])(Token\.(Implementation|Object)|foundry\.canvas\.placeables\.Token)\b|(^|[^\w.])Token(\[\])?$/;

/** The exported interfaces and type aliases of a file, each with the text of the types it names */
function exportedTypes(file: string): { name: string, refs: string[] }[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found: { name: string, refs: string[] }[] = [];
  const isExported = (node: ts.Node) => !!ts.getCombinedModifierFlags(node as ts.Declaration) && (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
  for (const statement of source.statements) {
    if (!(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) || !isExported(statement)) continue;
    const refs: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isTypeReferenceNode(node)) refs.push(node.typeName.getText(source));
      ts.forEachChild(node, visit);
    };
    visit(statement);
    found.push({ name: statement.name.text, refs });
  }
  return found;
}

describe("contract types (section 18)", () => {
  it("finds the contract files", () => {
    expect(contractFiles.length).toBeGreaterThan(10);
  });

  it("no exported contract type names a canvas Token", () => {
    const problems: string[] = [];
    for (const file of contractFiles)
      for (const { name, refs } of exportedTypes(file))
        for (const ref of refs) if (CANVAS_TOKEN.test(ref)) problems.push(`${path.relative(root, file)}: ${name} names ${ref}`);
    expect(problems).toEqual([]);
  });
});
