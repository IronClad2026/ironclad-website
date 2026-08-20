import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const actionPath = resolve(process.cwd(), "app/legal-update-actions.ts");

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
  );
}

function isAsyncFunction(node: ts.Node) {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
    hasModifier(node, ts.SyntaxKind.AsyncKeyword)
  );
}

function declarationName(node: ts.Node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }

  return ts.isVariableDeclaration(node)
    ? node.name.getText()
    : ts.SyntaxKind[node.kind];
}

function invalidRuntimeExports(sourceText: string) {
  const source = ts.createSourceFile(
    actionPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const violations: string[] = [];

  for (const statement of source.statements) {
    const isExportSyntax =
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      hasModifier(statement, ts.SyntaxKind.ExportKeyword);

    if (!isExportSyntax) continue;

    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const isTypeOnly =
        statement.isTypeOnly ||
        (statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.every((element) => element.isTypeOnly));

      if (!isTypeOnly) {
        violations.push(`runtime re-export on line ${lineOf(source, statement)}`);
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      if (!isAsyncFunction(statement)) {
        violations.push(
          `${declarationName(statement)} on line ${lineOf(source, statement)}`
        );
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals || !isAsyncFunction(statement.expression)) {
        violations.push(
          `${declarationName(statement)} on line ${lineOf(source, statement)}`
        );
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const isConst = Boolean(
        statement.declarationList.flags & ts.NodeFlags.Const
      );

      for (const declaration of statement.declarationList.declarations) {
        if (
          !isConst ||
          declaration.initializer === undefined ||
          !isAsyncFunction(declaration.initializer)
        ) {
          violations.push(
            `${declarationName(declaration)} on line ${lineOf(source, declaration)}`
          );
        }
      }
      continue;
    }

    violations.push(
      `${declarationName(statement)} on line ${lineOf(source, statement)}`
    );
  }

  return { source, violations };
}

function lineOf(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

describe("legal update Server Action export contract", () => {
  it("keeps every runtime export in the file-level use-server module async", () => {
    const sourceText = readFileSync(actionPath, "utf8");
    const { source, violations } = invalidRuntimeExports(sourceText);
    const firstStatement = source.statements[0];

    expect(
      firstStatement &&
        ts.isExpressionStatement(firstStatement) &&
        ts.isStringLiteral(firstStatement.expression) &&
        firstStatement.expression.text
    ).toBe("use server");
    expect(violations).toEqual([]);
  });

  it("rejects the exact runtime-object export that caused E352", () => {
    const regression = `"use server";\nexport const initialAccountLegalAcceptanceActionState = {\n  status: "idle",\n  code: "idle",\n};\n`;

    expect(invalidRuntimeExports(regression).violations).toEqual([
      "initialAccountLegalAcceptanceActionState on line 2",
    ]);
  });
});
