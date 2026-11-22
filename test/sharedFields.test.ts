import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * M31: SHARED_FIELDS (steps/steps.ts) checked against the code. Every step body (setStepRun("midi-qol.<Step>", ...) in
 * workflowSteps/, a WorkflowState_<Step> method in Workflow.ts) that assigns a shared field directly must be listed as
 * one of its writers. Writes inside helpers a step calls aren't seen: this catches a step that starts writing a shared
 * field without the table saying so.
 */

const root = path.resolve(__dirname, "../src/module");
const read = (file: string) => ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

/** SHARED_FIELDS as written in steps.ts: field -> writers */
function sharedFields(): Map<string, Set<string>> {
  const source = read(path.join(root, "steps", "steps.ts"));
  const fields = new Map<string, Set<string>>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "SHARED_FIELDS" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) continue;
        const writers = property.initializer.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "writers") as ts.PropertyAssignment | undefined;
        const list = writers && ts.isArrayLiteralExpression(writers.initializer) ? writers.initializer.elements.map(e => ts.isStringLiteral(e) ? e.text : "") : [];
        fields.set(property.name.getText(source), new Set(list));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return fields;
}

/** The fields a function assigns on `receiver` (workflow.x = / this.x =, compound assignments too) */
function assigned(body: ts.Node, source: ts.SourceFile, receiver: string): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(source) === receiver) found.add(node.left.name.text);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** step id -> the fields its body assigns directly */
function stepWrites(): Map<string, Set<string>> {
  const writes = new Map<string, Set<string>>();
  const add = (step: string, fields: Set<string>) => writes.set(step, new Set([...(writes.get(step) ?? []), ...fields]));
  const dir = path.join(root, "workflowSteps");
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".ts"))) {
    const source = read(path.join(dir, file));
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "setStepRun" && ts.isStringLiteral(node.arguments[0]) && node.arguments[1])
        add(node.arguments[0].text, assigned(node.arguments[1], source, "workflow"));
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const workflow = read(path.join(root, "Workflow.ts"));
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(workflow).startsWith("WorkflowState_") && node.body)
      add(`midi-qol.${node.name.getText(workflow).slice("WorkflowState_".length)}`, assigned(node.body, workflow, "this"));
    ts.forEachChild(node, visit);
  };
  visit(workflow);
  return writes;
}

describe("SHARED_FIELDS (M31)", () => {
  it("reads the table and the step bodies", () => {
    expect(sharedFields().size).toBeGreaterThan(3);
    expect(stepWrites().size).toBeGreaterThan(10);
  });

  it("a step that writes a shared field is one of its writers", () => {
    const fields = sharedFields();
    const problems: string[] = [];
    for (const [step, written] of stepWrites())
      for (const field of written)
        if (fields.has(field) && !fields.get(field)!.has(step)) problems.push(`${step} writes ${field}: not among its writers in SHARED_FIELDS`);
    expect(problems).toEqual([]);
  });
});
