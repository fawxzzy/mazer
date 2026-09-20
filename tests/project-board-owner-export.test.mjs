import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertFawxzzyWebConsumerAcceptance,
  assertPublicSafety,
  buildProjectBoardOwnerExport,
  readOwnerExportSources,
  renderProjectBoardOwnerExport,
  runProjectBoardOwnerExport,
} from "../scripts/export-project-board-owner.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const bytes = readOwnerExportSources(repoRoot);
const registry = JSON.parse(bytes["mazer-owner-work-registry"]);

test("exports only the exact current public Mazer owner set", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(output.contract_version, "atlas.project-board.owner-export.v1");
  assert.equal(output.project_id, "mazer");
  assert.equal(output.board_id, "discordos:project-feedback:mazer");
  assert.equal(output.extensions.stable_identity_count, 13);
  assert.equal(output.cards.length, 3);
  assert.deepEqual(output.cards.map((card) => card.record.card_id), ["MAZER-2D-001", "MAZER-NATIVE-001", "MAZER-WORLD-001"]);
  assert.equal(new Set(output.cards.map((card) => card.idempotency_key)).size, 3);
  assert.deepEqual(
    output.cards.find((card) => card.record.card_id === "MAZER-WORLD-001").record.dependencies,
    ["MAZER-2D-001", "MAZER-TELEPORT-001"],
  );
  assert.equal(
    output.cards.length + output.extensions.excluded_completed_card_count + output.extensions.excluded_deferred_candidate_count,
    output.extensions.stable_identity_count,
  );
});

test("retains completed truth in the registry and excludes it from public cards", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const completed = registry.workItems.filter((item) => item.status === "completed");
  assert.equal(completed.length, 8);
  assert.equal(output.extensions.excluded_completed_card_count, 8);
  for (const item of completed) assert.equal(output.cards.some((card) => card.record.card_id === item.id), false);
});

test("excludes deferred research candidates and imports no research inventory", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const deferred = registry.workItems.filter((item) => item.status === "deferred_candidate");
  assert.equal(deferred.length, 2);
  assert.equal(output.extensions.excluded_deferred_candidate_count, 2);
  assert.equal(output.extensions.imported_research_candidate_count, 0);
  assert.equal(output.extensions.research_candidate_exported_count, 0);
  for (const item of deferred) assert.equal(output.cards.some((card) => card.record.card_id === item.id), false);
});

test("maps active and planned lifecycle without inventing readiness", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const byId = new Map(output.cards.map((card) => [card.record.card_id, card]));
  assert.deepEqual([byId.get("MAZER-2D-001").record_status, byId.get("MAZER-2D-001").record.lifecycle], ["active", "in-progress"]);
  assert.deepEqual([byId.get("MAZER-WORLD-001").record_status, byId.get("MAZER-WORLD-001").record.lifecycle], ["active", "in-progress"]);
  assert.deepEqual([byId.get("MAZER-NATIVE-001").record_status, byId.get("MAZER-NATIVE-001").record.lifecycle], ["candidate", "planning"]);
  assert.ok(output.cards.every((card) => card.content.blockers.length === 0));
});

test("validates stable dependency relationships and preserves deterministic deduplication", () => {
  const withDuplicate = structuredClone(registry);
  const world = withDuplicate.workItems.find((item) => item.id === "MAZER-WORLD-001");
  world.dependencies = ["MAZER-2D-001", "MAZER-2D-001"];
  const output = buildProjectBoardOwnerExport(withDuplicate, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(withDuplicate),
  });
  const exportedWorld = output.cards.find((card) => card.record.card_id === "MAZER-WORLD-001");
  assert.deepEqual(exportedWorld.record.dependencies, ["MAZER-2D-001"]);

  const malformed = structuredClone(registry);
  malformed.workItems[0].dependencies = "MAZER-WORLD-001";
  assert.throws(
    () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
    /dependencies must be an array/,
  );

  const dangling = structuredClone(registry);
  dangling.workItems[0].dependencies = ["MAZER-MISSING-001"];
  assert.throws(
    () => buildProjectBoardOwnerExport(dangling, { ...bytes, "mazer-owner-work-registry": JSON.stringify(dangling) }),
    /unknown stable registry identity/,
  );

  const malformedEntry = structuredClone(registry);
  malformedEntry.workItems[0].dependencies = [null];
  assert.throws(
    () => buildProjectBoardOwnerExport(malformedEntry, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformedEntry) }),
    /unknown stable registry identity/,
  );

  const self = structuredClone(registry);
  self.workItems[0].dependencies = [self.workItems[0].id];
  assert.throws(
    () => buildProjectBoardOwnerExport(self, { ...bytes, "mazer-owner-work-registry": JSON.stringify(self) }),
    /cannot depend on itself/,
  );

  for (const [label, mutate] of [
    ["two-node public cycle", (value) => {
      value.workItems.find((item) => item.id === "MAZER-2D-001").dependencies = ["MAZER-WORLD-001"];
    }],
    ["three-node completed cycle", (value) => {
      value.workItems.find((item) => item.id === "MAZER-DATA-001").dependencies = ["MAZER-AUTH-QA-001"];
    }],
    ["lifecycle-crossing cycle", (value) => {
      value.workItems.find((item) => item.id === "MAZER-2D-001").dependencies = ["MAZER-PLANET-001"];
    }],
  ]) {
    const cyclic = structuredClone(registry);
    mutate(cyclic);
    assert.throws(
      () => buildProjectBoardOwnerExport(cyclic, { ...bytes, "mazer-owner-work-registry": JSON.stringify(cyclic) }),
      /dependency graph must be acyclic/,
      label,
    );
  }
});

test("resolves only rendered Markdown headings with the required GitHub-compatible slug behavior", () => {
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(registry, bytes));

  const duplicateHeading = structuredClone(registry);
  duplicateHeading.workItems[0].sourceRef = "docs/current-truth.md#repeated-heading-1";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(duplicateHeading, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(duplicateHeading),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## Repeated heading\n\n## Repeated heading\n`,
  }));

  const underscoreHeading = structuredClone(registry);
  underscoreHeading.workItems[0].sourceRef = "docs/current-truth.md#heading_with_underscore-punctuation";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(underscoreHeading, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(underscoreHeading),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## Heading_with_underscore: punctuation!\n`,
  }));

  for (const [sourceRef, heading] of [
    ["docs/current-truth.md#this-is-emphasis", "## This _is_ emphasis"],
    ["docs/current-truth.md#outer-inner-and-adjacentmarks-punctuation", "## _Outer **inner**_ and __adjacent__*marks* punctuation!"],
    ["docs/current-truth.md#both", "## ___both___"],
    ["docs/current-truth.md#-this-is-emphasized", "## 😀 This _is_ emphasized"],
    ["docs/current-truth.md#keep-_literal_-underscores", "## Keep \\_literal\\_ underscores"],
    ["docs/current-truth.md#use-_literal_", "## Use `_literal_`"],
    ["docs/current-truth.md#use-foo", "## Use ` foo `"],
    ["docs/current-truth.md#use--foo", "## Use `  foo  `"],
    ["docs/current-truth.md#use-a--b", "## Use ``a ` b``"],
  ]) {
    const emphasizedHeading = structuredClone(registry);
    emphasizedHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(emphasizedHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(emphasizedHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${heading}\n`,
    }));
  }

  for (const [label, sourceRef, markdown] of [
    ["named references use the complete case-sensitive table", "docs/current-truth.md#æther-", "## &AElig;ther &copy;"],
    ["lowercase named references remain valid", "docs/current-truth.md#æther", "## &aelig;ther"],
    ["decimal and hexadecimal references decode before slugging", "docs/current-truth.md#astral-", "## &#65;stral &#x1F680;"],
    ["astral letters survive Unicode-aware slugging", "docs/current-truth.md#𐐨", "## &#x10400;"],
    ["invalid code points become the replacement character", "docs/current-truth.md#-replacement", "## &#0; replacement"],
    ["surrogate code points become the replacement character", "docs/current-truth.md#surrogate-", "## Surrogate &#xD800;"],
    ["missing semicolons remain literal", "docs/current-truth.md#aelig", "## &AElig"],
    ["unknown names remain literal", "docs/current-truth.md#notdefined", "## &NotDefined;"],
    ["named references remain case sensitive", "docs/current-truth.md#aelig", "## &AELIG;"],
    ["overlong decimal references remain literal", "docs/current-truth.md#87654321", "## &#87654321;"],
    ["overlong hexadecimal references remain literal", "docs/current-truth.md#xabcdef0", "## &#xabcdef0;"],
    ["code spans stay literal beside decoded emphasis", "docs/current-truth.md#aelig-æ", "## `&AElig;` **&AElig;**"],
    ["code spans preserve literal tags and references", "docs/current-truth.md#span-titleaeligaeligspan", "## `<span title=\"&AElig;\">&AElig;</span>`"],
    ["escaped backticks do not open code spans", "docs/current-truth.md#æ", "## \\`&AElig;`"],
    ["escaped ampersands stay literal beside decoded references", "docs/current-truth.md#aelig-æ", "## \\&AElig; &AElig;"],
    ["quoted tag delimiters cannot leak references", "docs/current-truth.md#visible", "## <span title=\"> &AElig;\">Visible</span>"],
    ["single-quoted tag delimiters cannot leak references", "docs/current-truth.md#visible-æ", "## <span title='> &AElig;'>Visible</span> &AElig;"],
    ["inline comments cannot leak references", "docs/current-truth.md#visible", "## <!-- > &AElig; -->Visible"],
    ["CommonMark short comment opener leaves following text visible", "docs/current-truth.md#foo---", "## <!--> foo -->"],
    ["CommonMark short hyphen comment opener leaves following text visible", "docs/current-truth.md#foo---", "## <!---> foo -->"],
    ["processing instructions cannot leak references", "docs/current-truth.md#visible", "## <?target > &AElig;?>Visible"],
    ["CDATA sections cannot leak references", "docs/current-truth.md#visible", "## <![CDATA[> &AElig;]]>Visible"],
    ["GFM declarations do not contribute visible slug text", "docs/current-truth.md#visible", "## <!ELEMENT br EMPTY>Visible"],
    ["declaration-like question text remains visible", "docs/current-truth.md#a", "## <!A?>"],
    ["declaration-like numeric text remains visible", "docs/current-truth.md#a1", "## <!A1>"],
    ["declaration-like hyphen text remains visible", "docs/current-truth.md#a-x", "## <!A-x>"],
    ["ordinary angle-bracket text is not inline HTML", "docs/current-truth.md#a--b--c", "## A < B > C"],
    ["escaped inline tags remain visible heading text", "docs/current-truth.md#spanfoo", "## \\<span>foo"],
    ["valid adjacent inline comments add no source-width spacing", "docs/current-truth.md#ab", "## A<!--ok-->B"],
  ]) {
    const referenceHeading = structuredClone(registry);
    referenceHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(referenceHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(referenceHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), label);
  }

  for (const [label, sourceRef, markdown] of [
    ["full reference links use rendered label text", "docs/current-truth.md#foo", "## [Foo][docs]\n\n[docs]: /target"],
    ["multiline reference definitions preserve continuation indentation", "docs/current-truth.md#foo", "## [Foo][docs]\n\n   [docs]:\n      /target\n           'the title'"],
    ["collapsed reference links use rendered label text", "docs/current-truth.md#foo", "## [Foo][]\n\n[foo]: /target"],
    ["shortcut reference links use rendered label text", "docs/current-truth.md#foo", "## [Foo]\n\n[FOO]: /target"],
    ["reference images use rendered alt text", "docs/current-truth.md#foo", "## ![Foo][docs]\n\n[docs]: /target"],
    ["balanced nested reference text uses rendered label text", "docs/current-truth.md#foo-bar", "## [Foo [bar]][docs]\n\n[docs]: /target"],
    ["block-quoted definitions resolve document-wide references", "docs/current-truth.md#foo", "## [Foo][docs]\n\n> [docs]: /target"],
    ["balanced bare destinations define references", "docs/current-truth.md#foo", "## [Foo][docs]\n\n[docs]: /foo(bar)"],
    ["escaped bare destination parentheses stay literal", "docs/current-truth.md#foo", "## [Foo][docs]\n\n[docs]: /foo\\(bar"],
  ]) {
    const referenceLinkHeading = structuredClone(registry);
    referenceLinkHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(referenceLinkHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(referenceLinkHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), label);
  }

  for (const [label, sourceRef, markdown] of [
    ["unresolved references remain literal", "docs/current-truth.md#foo", "## [Foo][missing]"],
    ["escaped reference openers remain literal", "docs/current-truth.md#foo", "## \\[Foo][docs]\n\n[docs]: /target"],
    ["unbalanced opening parentheses do not define references", "docs/current-truth.md#unbalancedopening", "## [UnbalancedOpening][bad-open]\n\n[bad-open]: /foo(bar"],
    ["unbalanced closing parentheses do not define references", "docs/current-truth.md#unbalancedclosing", "## [UnbalancedClosing][bad-close]\n\n[bad-close]: /foo)bar"],
    ["malformed inline comments remain visible", "docs/current-truth.md#ab", "## A<!-- foo -- bar -->B"],
    ["block-quoted fenced definitions remain inert", "docs/current-truth.md#foo", "## [Foo][docs]\n\n> ```text\n> [docs]: /target\n> ```"],
    ["block-quoted raw-HTML definitions remain inert", "docs/current-truth.md#foo", "## [Foo][docs]\n\n> <pre>\n> [docs]: /target\n> </pre>"],
  ]) {
    const danglingReferenceLink = structuredClone(registry);
    danglingReferenceLink.workItems[0].sourceRef = sourceRef;
    assert.throws(() => buildProjectBoardOwnerExport(danglingReferenceLink, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(danglingReferenceLink),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), /sourceRef fragment does not exist/, label);
  }

  const duplicateReferenceHeading = structuredClone(registry);
  duplicateReferenceHeading.workItems[0].sourceRef = "docs/current-truth.md#æ-1";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(duplicateReferenceHeading, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(duplicateReferenceHeading),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## &AElig;\n## Æ\n`,
  }), "decoded and literal headings share the duplicate suffix sequence");

  const markupSlug = structuredClone(registry);
  markupSlug.workItems[0].sourceRef = "docs/current-truth.md#this-_is_-emphasis";
  assert.throws(() => buildProjectBoardOwnerExport(markupSlug, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(markupSlug),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## This _is_ emphasis\n`,
  }), /sourceRef fragment does not exist/);

  for (const [sourceRef, heading] of [
    ["docs/current-truth.md#_both_", "## ___both___"],
    ["docs/current-truth.md#-this-_s_emphasized", "## 😀 This _is_ emphasized"],
    ["docs/current-truth.md#use--foo", "## Use ` foo `"],
    ["docs/current-truth.md#use-a-b", "## Use ``a ` b``"],
  ]) {
    const danglingMarkup = structuredClone(registry);
    danglingMarkup.workItems[0].sourceRef = sourceRef;
    assert.throws(() => buildProjectBoardOwnerExport(danglingMarkup, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(danglingMarkup),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${heading}\n`,
    }), /sourceRef fragment does not exist/);
  }

  for (const [label, fencedMarkdown] of [
    ["backtick fence with info string", "````markdown\n## Fenced Heading\n````"],
    ["tilde fence with a longer closer", "~~~md\nFenced Heading\n---\n~~~~"],
    ["short closer does not end a fence", "````md\n## Fenced Heading\n```\n## Still Fenced\n````"],
    ["indented code", "paragraph\n\n    ## Fenced Heading"],
  ]) {
    const fencedHeading = structuredClone(registry);
    fencedHeading.workItems[0].sourceRef = "docs/current-truth.md#fenced-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(fencedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(fencedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${fencedMarkdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  const headingAfterFence = structuredClone(registry);
  headingAfterFence.workItems[0].sourceRef = "docs/current-truth.md#heading-after-fence";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(headingAfterFence, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(headingAfterFence),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n\`\`\`md\n## Fenced Heading\n\`\`\`\n## Heading After Fence\n`,
  }));

  for (const [label, markdown] of [
    ["four leading spaces", "paragraph\n\n    ## Hidden Indented Heading"],
    ["leading tab", "paragraph\n\n\t## Hidden Indented Heading"],
    ["one space then tab", "paragraph\n\n \t## Hidden Indented Heading"],
    ["two spaces then tab reproduces hosted finding", "paragraph\n\n  \t## Hidden Tab Indented"],
    ["three spaces then tab", "paragraph\n\n   \t## Hidden Indented Heading"],
    ["tab retains four columns after unordered-list container projection", "- item\n    \t## Hidden Indented Heading"],
    ["tab retains four columns after nested-list container projection", "- outer\n  - item\n        \t## Hidden Indented Heading"],
    ["four-column setext underline", "Hidden Indented Heading\n  \t---"],
  ]) {
    const indentedHeading = structuredClone(registry);
    indentedHeading.workItems[0].sourceRef = label.includes("hosted finding")
      ? "docs/current-truth.md#hidden-tab-indented"
      : "docs/current-truth.md#hidden-indented-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(indentedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(indentedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [label, markdown] of [
    ["zero-space heading", "## Visible Heading"],
    ["one-space heading", " ## Visible Heading"],
    ["two-space heading", "  ## Visible Heading"],
    ["three-space heading", "   ## Visible Heading"],
    ["unordered-list projected heading", "- item\n  ## Visible Heading"],
    ["unordered-list projected tab heading", "- item\n  \t## Visible Heading"],
    ["ordered-list projected tab heading", "1. item\n   \t## Visible Heading"],
    ["nested-list projected heading", "- outer\n  - item\n    ### Visible Heading"],
    ["nested ordered-list projected tab heading", "- outer\n  1. item\n     \t### Visible Heading"],
    ["ancestor sibling after nested unordered item", "1.  outer\n    - child\n      continuation\n    - sibling\n      ## Visible Heading"],
    ["ancestor sibling after a blank separator", "1.  outer\n    - child\n\n    - sibling\n      ## Visible Heading"],
    ["ordered ancestor sibling after nested ordered item", "10. outer\n    1) child\n       continuation\n    2) sibling\n       ## Visible Heading"],
    ["wide ancestor sibling refreshes the active leaf indent", "1.  outer\n    - child\n      continuation\n    1.    sibling\n          ## Visible Heading"],
    ["full top-level exit after a nested list", "1. outer\n   - child\n     continuation\n- top\n  ## Visible Heading"],
    ["heading resumes after four-column code", "    ## Hidden Indented Heading\n## Visible Heading"],
    ["heading resumes after mixed-tab code", "  \t## Hidden Tab Indented\n## Visible Heading"],
    ["heading resumes when an unclosed quoted fence exits its quote", "> ```text\n> fenced\n## Visible Heading"],
    ["heading resumes when an unclosed quoted raw block exits its quote", "> <pre>\n> raw\n## Visible Heading"],
    ["root inline-comment state cannot enter a new quote", "Paragraph <!--\n> ## Visible Heading"],
    ["quoted inline-comment state cannot enter a nested quote", "> Paragraph <!--\n> > ## Visible Heading"],
  ]) {
    const visibleHeading = structuredClone(registry);
    visibleHeading.workItems[0].sourceRef = "docs/current-truth.md#visible-heading";
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(visibleHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(visibleHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), label);
  }

  for (const [label, fencedMarkdown] of [
    ["unordered list-contained fence", "- ```md\n  ## Hidden List Fence\n  ```"],
    ["ordered list-contained tilde fence", "1. ~~~md\n   ## Hidden List Fence\n   ~~~"],
    ["nested list-contained fence with blank lines", "- outer\n  - ```md\n\n    ## Hidden List Fence\n\n    ```"],
    [
      "nested parent fence retains the actual parent indentation",
      "- outer\n  - ~~~md\n    code\n   ~~~\n  ## Hidden List Fence\n  ~~~\n## Visible After Parent Fence",
    ],
    [
      "ordered nested parent fence retains the actual parent indentation",
      "1. outer\n   1. ~~~md\n      code\n    ~~~\n   ## Hidden List Fence\n   ~~~\n## Visible After Parent Fence",
    ],
    [
      "deep nested parent fence retains the actual ancestor indentation",
      "- outer\n  - middle\n    - ~~~md\n      code\n     ~~~\n    ## Hidden List Fence\n    ~~~\n## Visible After Parent Fence",
    ],
    ["list-contained indented code takes precedence", "-     ```md\n      ## Hidden List Fence\n      ```"],
    ["lazy list continuation followed by a top-level fence", "- paragraph\nlazy continuation\n```md\n## Hidden List Fence\n```"],
    [
      "shorter marker does not close a nested fence",
      "- outer\n  - ````md\n    ## Hidden List Fence\n    ```\n    ## Hidden After Short Fence\n    `````",
    ],
    ["quoted fence markers cannot close a root fence", "```text\n> ```\n## Hidden List Fence\n```"],
  ]) {
    const listFencedHeading = structuredClone(registry);
    listFencedHeading.workItems[0].sourceRef = "docs/current-truth.md#hidden-list-fence";
    assert.throws(
      () => buildProjectBoardOwnerExport(listFencedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(listFencedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${fencedMarkdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [sourceRef, fencedMarkdown] of [
    [
      "docs/current-truth.md#first-real-heading-after-list-fence",
      "- ````md\n  ## Hidden List Fence\n  ```\n  ## Hidden After Short Fence\n  `````\n## First Real Heading After List Fence",
    ],
    [
      "docs/current-truth.md#visible-sibling-list-heading",
      "- ~~~md\n  ## Hidden List Fence\n  ~~~~\n- sibling\n  ## Visible Sibling List Heading",
    ],
    [
      "docs/current-truth.md#heading-after-invalid-list-fence-info",
      "- ```info`tick\n  ## Heading After Invalid List Fence Info",
    ],
    [
      "docs/current-truth.md#real-heading-after-unclosed-list-fence",
      "- ~~~md\n  code\n## Real Heading After Unclosed List Fence",
    ],
    [
      "docs/current-truth.md#real-heading-in-sibling-list-item",
      "- ~~~md\n  code\n- sibling\n  ## Real Heading In Sibling List Item",
    ],
    [
      "docs/current-truth.md#real-heading-in-parent-list-item",
      "- outer\n  - ~~~md\n    code\n  ## Real Heading In Parent List Item",
    ],
    [
      "docs/current-truth.md#real-heading-after-reopened-top-level-fence",
      "- ~~~md\n  code\n~~~\n## Hidden In Reopened Top Level Fence\n~~~\n## Real Heading After Reopened Top Level Fence",
    ],
    [
      "docs/current-truth.md#real-heading-after-noninterrupting-ordered-marker",
      "paragraph\n2. ~~~md\n## Real Heading After Noninterrupting Ordered Marker",
    ],
    [
      "docs/current-truth.md#real-heading-after-ordered-list-fence",
      "1. item\n2. ~~~md\n   ## Hidden List Fence\n   ~~~\n3. sibling\n   ## Real Heading After Ordered List Fence",
    ],
  ]) {
    const headingAfterListFence = structuredClone(registry);
    headingAfterListFence.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(headingAfterListFence, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(headingAfterListFence),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${fencedMarkdown}\n`,
    }));
  }

  for (const [label, commentedMarkdown] of [
    ["same-line comment", "<!-- ## Commented Heading -->"],
    ["multiline comment", "<!--\n## Commented Heading\n-->"],
    ["comment then heading on the same line", "<!-- hidden --> ## Commented Heading"],
  ]) {
    const commentedHeading = structuredClone(registry);
    commentedHeading.workItems[0].sourceRef = "docs/current-truth.md#commented-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(commentedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(commentedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${commentedMarkdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [sourceRef, markdown] of [
    ["docs/current-truth.md#heading-before-comment", "## Heading Before Comment\n<!--\n## Hidden Heading\n-->"],
    ["docs/current-truth.md#heading-after-comment", "<!-- hidden -->\n## Heading After Comment"],
    ["docs/current-truth.md#heading-with-trailing-comment", "## Heading With Trailing Comment <!-- hidden -->"],
  ]) {
    const visibleHeading = structuredClone(registry);
    visibleHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(visibleHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(visibleHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }));
  }

  for (const [label, rawHtml] of [
    ["pre block", "<pre>\n## Hidden Raw Heading\n</pre>"],
    ["type 1 ignores a different raw-text close", "<pre>\n</style>\n## Hidden Raw Heading\n</pre>"],
    ["type 1 ignores multiple different raw-text closes", "<textarea>\n</pre>\n</script>\n</style>\n## Hidden Raw Heading\n</textarea>"],
    ["script block with mixed case and attributes", "<ScRiPt type=\"application/json\">\n## Hidden Raw Heading\n</sCrIpT>"],
    ["style block", "<style>\n## Hidden Raw Heading\n</style>"],
    ["textarea block", "<textarea name=\"example\">\n## Hidden Raw Heading\n</textarea>"],
    ["processing instruction", "<?target\n## Hidden Raw Heading\n?>"],
    ["declaration", "<!DOCTYPE\n## Hidden Raw Heading\n>"],
    ["CDATA", "<![CDATA[\n## Hidden Raw Heading\n]]>"],
    ["type 6 block tag", "<TaBlE class=\"example\">\n## Hidden Raw Heading\n</table>\nstill raw"],
    ["type 7 complete open tag", "<x-widget data-example=\"1\">\n## Hidden Raw Heading"],
    ["type 7 complete closing tag", "</x-widget>\n## Hidden Raw Heading"],
    ["type 6 interrupts a paragraph", "paragraph\n<table>\n## Hidden Raw Heading"],
    ["type 7 after thematic break", "---\n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after indented thematic break", "   * * *   \n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after bare blockquote", ">   \n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after empty dash list marker", "-   \n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after empty plus list marker", " +\t\n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after empty star list marker", "  * \n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after empty ordered dot marker", "1.   \n<x-widget>\n## Hidden Raw Heading\n"],
    ["type 7 after empty ordered paren marker", "  2)\t\n<x-widget>\n## Hidden Raw Heading\n"],
    ["unclosed raw block", "<pre class=\"example\">\n## Hidden Raw Heading\n## Still Hidden"],
    ["unclosed processing instruction", "<?target\n## Hidden Raw Heading"],
    ["unclosed CDATA", "<![CDATA[\n## Hidden Raw Heading"],
  ]) {
    const rawHeading = structuredClone(registry);
    rawHeading.workItems[0].sourceRef = "docs/current-truth.md#hidden-raw-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(rawHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(rawHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${rawHtml}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [label, markdown] of [
    ["unordered list paragraph exits before type 7", "- item\n  continuation\n<span>\n## Hidden Raw Heading\n"],
    ["ordered list paragraph exits before type 7", "1. item\n   continuation\n<span>\n## Hidden Raw Heading\n"],
    ["wide unordered item content indentation exits before type 7", "-   item\n    continuation\n<span>\n## Hidden Raw Heading\n"],
    ["wide ordered marker content indentation exits before type 7", "10.  item\n     continuation\n<span>\n## Hidden Raw Heading\n"],
    ["nested list paragraph exits to the document before type 7", "- outer\n  - inner\n    continuation\n<span>\n## Hidden Raw Heading\n"],
    ["nested list paragraph exits to its parent before type 7", "- outer\n  - inner\n    continuation\n  <span>\n  ## Hidden Raw Heading\n"],
    ["sibling list paragraph exits before type 7", "- first\n  continuation\n- second\n  continuation\n<span>\n## Hidden Raw Heading\n"],
    ["lazy list continuation exits before type 7", "- item\nlazy continuation\n<span>\n## Hidden Raw Heading\n"],
    ["blank line exits list paragraph before type 7", "- item\n  continuation\n\n<span>\n## Hidden Raw Heading\n"],
    ["five-space dash item starts with code before type 7", "-     code\n  <span>\n  ## Hidden Raw Heading\n"],
    ["five-space plus item starts with code before type 7", "+     code\n  <span>\n  ## Hidden Raw Heading\n"],
    ["five-space star item starts with code before type 7", "*     code\n  <span>\n  ## Hidden Raw Heading\n"],
    ["five-space ordered item starts with code before type 7", "1.     code\n   <span>\n   ## Hidden Raw Heading\n"],
    ["type 7 inside an unordered list item", "- <x-widget>\n  ## Hidden Raw Heading\n"],
    ["type 7 inside an ordered list item", "1. <x-widget>\n   ## Hidden Raw Heading\n"],
    ["type 7 inside a nested list item", "- outer\n  - <x-widget>\n    ## Hidden Raw Heading\n"],
    ["type 7 in an ancestor sibling after nested content", "1.  outer\n    - child\n      continuation\n    - <x-widget>\n      ## Hidden Raw Heading\n"],
    ["noninterrupting wide ordered ancestor sibling starts type 7", "1.  outer\n    - child\n      continuation\n    2.    <x-widget>\n          ## Hidden Raw Heading\n"],
    ["type 7 after seventeen compact nested list markers", `${"- ".repeat(17)}<x-widget>\n${"  ".repeat(17)}## Hidden Raw Heading\n`],
    ["type 7 after a one-hyphen GFM delimiter", "| Column |\n| - |\n<span>\n## Hidden Raw Heading\n"],
    ["type 7 after a two-hyphen GFM delimiter", "| Column |\n| -- |\n<span>\n## Hidden Raw Heading\n"],
    ["type 7 after a GFM table header and delimiter", "| Column |\n| --- |\n<span>\n## Hidden Raw Heading\n"],
    ["type 7 after aligned multi-column GFM table body", "| Left | Right |\n| :--- | ---: |\n| value | value |\n<span>\n## Hidden Raw Heading\n"],
    ["type 7 with a pipe-valued attribute terminates a GFM table", "| Column |\n| --- |\n<x-widget data-x=\"|\">\n## Hidden Raw Heading\n"],
    ["type 7 after a list-contained GFM table", "- | Column |\n  | --- |\n  <x-widget>\n  ## Hidden Raw Heading\n"],
  ]) {
    const rawHeading = structuredClone(registry);
    rawHeading.workItems[0].sourceRef = "docs/current-truth.md#hidden-raw-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(rawHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(rawHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [sourceRef, markdown] of [
    ["docs/current-truth.md#heading-before-raw", "## Heading Before Raw\n<pre>\n## Hidden Raw Heading\n</pre>"],
    ["docs/current-truth.md#heading-after-raw", "<SCRIPT type=\"application/json\">\n## Hidden Raw Heading\n</SCRIPT>\n## Heading After Raw"],
    ["docs/current-truth.md#heading-after-same-line-raw", "<style>hidden</style>\n## Heading After Same Line Raw"],
    ["docs/current-truth.md#heading-after-pi", "<?target\n## Hidden Raw Heading\n?>\n## Heading After PI"],
    ["docs/current-truth.md#heading-after-table", "<table>\n## Hidden Raw Heading\n</table>\n\n## Heading After Table"],
    ["docs/current-truth.md#heading-after-custom", "<x-widget>\n## Hidden Raw Heading\n\n## Heading After Custom"],
    ["docs/current-truth.md#visible-heading", "1. outer\n   - <x-widget>\n## Visible Heading"],
    ["docs/current-truth.md#visible-heading", "1. outer\n   - <table>\n   ## Visible Heading"],
    ["docs/current-truth.md#visible-heading", "1. outer\n   - <pre>\n## Visible Heading"],
    ["docs/current-truth.md#heading-after-inline-tag", "paragraph\n<x-widget>\n## Heading After Inline Tag"],
    ["docs/current-truth.md#heading-after-indented-paragraph-line", "paragraph\n    continuation\n<x-widget>\n## Heading After Indented Paragraph Line"],
    ["docs/current-truth.md#heading-after-nonstarting-ordered-text", "paragraph\n2. item\n<x-widget>\n## Heading After Nonstarting Ordered Text"],
    ["docs/current-truth.md#heading-after-list-inline-tag", "- paragraph\n  <span>\n  ## Heading After List Inline Tag"],
    ["docs/current-truth.md#heading-after-invalid-table-delimiter", "| Column |\n| : |\n<span>\n## Heading After Invalid Table Delimiter"],
    ["docs/current-truth.md#heading-after-mismatched-table-delimiter", "| Left | Right |\n| --- |\n<span>\n## Heading After Mismatched Table Delimiter"],
    ["docs/current-truth.md#heading-after-cross-quote-delimiter", "| Column |\n> | --- |\n> <span>\n> ## Heading After Cross Quote Delimiter"],
  ]) {
    const visibleHeading = structuredClone(registry);
    visibleHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(visibleHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(visibleHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }));
  }

  for (const [label, markdown] of [
    ["heading with a pipe terminates the table", "| Column |\n| --- |\n## Visible |Heading"],
    ["list block terminates the table", "| Column |\n| --- |\n- item | value\n## Visible Heading"],
    ["blockquote terminates the table", "| Column |\n| --- |\n> quote | value\n## Visible Heading"],
    ["fenced code terminates the table", "| Column |\n| --- |\n```text | metadata\n## Hidden Fenced Heading\n```\n## Visible Heading"],
    ["indented code terminates the table", "| Column |\n| --- |\n    code | value\n## Visible Heading"],
    ["blank line terminates the table", "| Column |\n| --- |\n\n## Visible Heading"],
  ]) {
    const visibleAfterTable = structuredClone(registry);
    visibleAfterTable.workItems[0].sourceRef = "docs/current-truth.md#visible-heading";
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(visibleAfterTable, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(visibleAfterTable),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), label);
  }

  const dangling = structuredClone(registry);
  dangling.workItems[0].sourceRef = "docs/current-truth.md#renamed-or-missing-heading";
  assert.throws(
    () => buildProjectBoardOwnerExport(dangling, { ...bytes, "mazer-owner-work-registry": JSON.stringify(dangling) }),
    /sourceRef fragment does not exist/,
  );

  const multilineSetext = structuredClone(registry);
  multilineSetext.workItems[0].sourceRef = "docs/current-truth.md#first-line-second-line";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(multilineSetext, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(multilineSetext),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\nFirst line\nsecond line\n---\n`,
  }));
  multilineSetext.workItems[0].sourceRef = "docs/current-truth.md#second-line";
  assert.throws(
    () => buildProjectBoardOwnerExport(multilineSetext, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(multilineSetext),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\nFirst line\nsecond line\n---\n`,
    }),
    /sourceRef fragment does not exist/,
  );

  for (const [label, sourceRef, markdown] of [
    [
      "noninterrupting ordered marker remains visible in the setext paragraph",
      "docs/current-truth.md#first-line-2-second-line",
      "First line\n2. second line\n---",
    ],
    [
      "multiline inline comment preserves surrounding setext paragraph text",
      "docs/current-truth.md#first-last",
      "First <!--\ncomment -->\nlast\n---",
    ],
    [
      "unclosed inline-comment opener remains literal in a setext paragraph",
      "docs/current-truth.md#first----last",
      "First <!--\nlast\n---",
    ],
    [
      "blank line terminates the comment-owning paragraph",
      "docs/current-truth.md#comment----last",
      "First <!--\n\ncomment -->\nlast\n---",
    ],
  ]) {
    const setext = structuredClone(registry);
    setext.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(setext, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(setext),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }), label);
  }

  const siblingListComment = structuredClone(registry);
  siblingListComment.workItems[0].sourceRef = "docs/current-truth.md#visible-heading";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(siblingListComment, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(siblingListComment),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n- Paragraph <!--\n- ## Visible Heading\n`,
  }));
  siblingListComment.workItems[0].sourceRef = "docs/current-truth.md#first-last";
  assert.throws(
    () => buildProjectBoardOwnerExport(siblingListComment, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(siblingListComment),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\nFirst <!--\n\ncomment -->\nlast\n---\n`,
    }),
    /sourceRef fragment does not exist/,
  );
});

test("requires every work item card type to match the atlas.card-record.v2 enum", () => {
  for (const [label, cardType] of [
    ["missing", undefined],
    ["non-string", null],
    ["unsupported", "feature_typo"],
  ]) {
    const malformed = structuredClone(registry);
    if (cardType === undefined) delete malformed.workItems[0].cardType;
    else malformed.workItems[0].cardType = cardType;
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      /cardType must be a supported atlas\.card-record\.v2 card type/,
      label,
    );
  }
});

test("requires every emitted priority to match the nullable atlas.card-record.v2 enum", () => {
  for (const [label, priority] of [
    ["missing", undefined],
    ["non-scalar", {}],
    ["unsupported", "urgent_typo"],
  ]) {
    const malformed = structuredClone(registry);
    if (priority === undefined) delete malformed.workItems[0].priority;
    else malformed.workItems[0].priority = priority;
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      /priority must match the atlas\.card-record\.v2 priority enum/,
      label,
    );
  }

  const nullable = structuredClone(registry);
  nullable.workItems[0].priority = null;
  const output = buildProjectBoardOwnerExport(nullable, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(nullable),
  });
  assert.equal(output.cards.find((card) => card.record.card_id === nullable.workItems[0].id).record.priority, null);
});

test("requires typed acceptance criteria before lifecycle filtering", () => {
  for (const status of ["active", "completed", "deferred_candidate"]) {
    const malformed = structuredClone(registry);
    const item = malformed.workItems.find((candidate) => candidate.status === status);
    item.acceptanceCriteria = ["valid", {}, null];
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      /acceptanceCriteria must be a non-empty string/,
      `${status} criteria are validated before lifecycle filtering`,
    );
  }

  const emptyCriterion = structuredClone(registry);
  emptyCriterion.workItems.find((item) => item.status === "completed").acceptanceCriteria[0] = "   ";
  assert.throws(
    () => buildProjectBoardOwnerExport(emptyCriterion, { ...bytes, "mazer-owner-work-registry": JSON.stringify(emptyCriterion) }),
    /acceptanceCriteria must be a non-empty string/,
  );
});

test("requires canonical calendar-valid UTC timestamps without coercion", () => {
  for (const [label, timestamp] of [
    ["boolean coercion", true],
    ["impossible calendar date", "2026-02-30T00:00:00.000Z"],
    ["missing millisecond precision", "2026-09-14T22:54:28Z"],
    ["timezone offset normalization", "2026-09-14T18:54:28.000-04:00"],
    ["lowercase UTC suffix", "2026-09-14T22:54:28.000z"],
  ]) {
    const malformed = structuredClone(registry);
    malformed.workItems[0].updatedAt = timestamp;
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      /must be a canonical UTC timestamp/,
      label,
    );
  }

  for (const id of ["MAZER-DATA-001", "MAZER-PLANET-001"]) {
    const malformed = structuredClone(registry);
    malformed.workItems.find((item) => item.id === id).updatedAt = true;
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      new RegExp(`${id}\\.updatedAt must be a canonical UTC timestamp`),
      `${id} timestamp is validated before lifecycle filtering`,
    );
  }

  const unsupportedLifecycle = structuredClone(registry);
  unsupportedLifecycle.workItems[0].updatedAt = true;
  unsupportedLifecycle.workItems[0].status = "active_typo";
  assert.throws(
    () => buildProjectBoardOwnerExport(unsupportedLifecycle, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(unsupportedLifecycle),
    }),
    /updatedAt must be a canonical UTC timestamp/,
    "timestamp validation precedes lifecycle admission",
  );

  const malformedRegistryTimestamp = structuredClone(registry);
  malformedRegistryTimestamp.updatedAt = "2026-02-30T00:00:00.000Z";
  assert.throws(
    () => buildProjectBoardOwnerExport(malformedRegistryTimestamp, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(malformedRegistryTimestamp),
    }),
    /registry\.updatedAt must be a canonical UTC timestamp/,
  );

  for (const status of ["active", "completed", "deferred_candidate"]) {
    const futureDated = structuredClone(registry);
    futureDated.workItems.find((item) => item.status === status).updatedAt = "2026-09-14T22:54:28.001Z";
    assert.throws(
      () => buildProjectBoardOwnerExport(futureDated, { ...bytes, "mazer-owner-work-registry": JSON.stringify(futureDated) }),
      /updatedAt must not be later than registry\.updatedAt/,
      `${status} future timestamp is rejected`,
    );
  }
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(registry, bytes));
});

test("keeps DiscordOS as provenance and board identity only", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(output.extensions.discordos_role, "provenance-and-board-identity-only");
  assert.ok(output.sources.every((source) => source.repository === "mazer"));
  assert.ok(output.cards.every((card) => card.record.owner === "mazer"));
  assert.ok(output.cards.every((card) => card.record.board_id === "discordos:project-feedback:mazer"));
});

test("passes the public-safety and FawxzzyWeb consumer contracts", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(assertPublicSafety(output), true);
  assert.equal(assertFawxzzyWebConsumerAcceptance(output), true);
  const unsafe = structuredClone(output);
  unsafe.cards[0].content.secret = "redacted";
  assert.throws(() => assertPublicSafety(unsafe), /forbidden key/);
  const terminal = structuredClone(output);
  terminal.cards[0].record.lifecycle = "completed";
  assert.throws(() => assertFawxzzyWebConsumerAcceptance(terminal), /non-public lifecycle/);
});

test("scans the complete public envelope and rejects sensitive values without echoing them", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const hostileCases = [
    ["top-level forbidden metadata", (value) => { value.access_token = "not-public"; }, /forbidden key export\.access_token/],
    ["source forbidden metadata", (value) => { value.sources[0].credential = "not-public"; }, /forbidden key export\.sources\[0\]\.credential/],
    ["email in title", (value) => { value.cards[0].record.title = "Contact owner@example.com"; }, /sensitive email address/],
    ["secret in description", (value) => { value.cards[0].record.description = "token=private-value"; }, /sensitive credential-like assignment/],
    ["secret in acceptance criteria", (value) => { value.cards[0].content.acceptance_criteria[0] = "Use https:\/\/example.test\/?token=private-value"; }, /sensitive query value/],
    ["PKCS8 private key", (value) => { value.cards[0].record.title = "-----BEGIN PRIVATE KEY-----\nprivate-material"; }, /sensitive PEM private key/],
    ["RSA private key with case and spacing drift", (value) => { value.cards[0].record.description = "-----begin  rsa   private key -----"; }, /sensitive PEM private key/],
    ["OpenSSH private key", (value) => { value.cards[0].content.acceptance_criteria[0] = "-----BEGIN OPENSSH PRIVATE KEY-----"; }, /sensitive PEM private key/],
    ["PGP private key block", (value) => { value.cards[0].content.summary = "-----BEGIN PGP PRIVATE KEY BLOCK-----"; }, /sensitive PEM private key/],
    ["wrapped Slack service credential", (value) => { value.cards[0].record.title = `wrapped (${["xoxb", "123456789012", "syntheticvalue"].join("-")})`; }, /sensitive known secret format/],
    ["AWS access-key prefix", (value) => { value.cards[0].record.description = `cloud ${`AKIA${"0".repeat(16)}`}`; }, /sensitive known secret format/],
    ["AWS temporary access-key prefix", (value) => { value.cards[0].record.description = `temporary ${`ASIA${"0".repeat(16)}`}`; }, /sensitive known secret format/],
    ["wrapped Stripe service credential", (value) => { value.cards[0].content.acceptance_criteria[0] = `(${`sk_live_${"A".repeat(20)}`})`; }, /sensitive known secret format/],
    ["Google API-key prefix", (value) => { value.cards[0].content.summary = `key ${`AIza${"A".repeat(35)}`}`; }, /sensitive known secret format/],
  ];
  for (const [label, mutate, expected] of hostileCases) {
    const hostile = structuredClone(output);
    mutate(hostile);
    assert.throws(() => assertPublicSafety(hostile), (error) => {
      assert.match(error.message, expected, label);
      assert.doesNotMatch(error.message, /owner@example\.com|private-value|not-public|BEGIN.*PRIVATE KEY|xoxb-|AKIA0|ASIA0|sk_live_|AIzaA/i, `${label} echoed a sensitive value`);
      return true;
    });
  }

  for (const safePemLabel of ["-----BEGIN PUBLIC KEY-----", "-----BEGIN CERTIFICATE-----"]) {
    const safe = structuredClone(output);
    safe.cards[0].record.title = safePemLabel;
    assert.doesNotThrow(() => assertPublicSafety(safe));
  }
});

test("renders deterministically and keeps the checked export current", () => {
  assert.equal(renderProjectBoardOwnerExport(repoRoot), renderProjectBoardOwnerExport(repoRoot));
  runProjectBoardOwnerExport(["--check"], repoRoot);
});

test("fails closed on denominator, identity, source, and stale-output drift", () => {
  const sourceIdentityDrift = structuredClone(registry);
  sourceIdentityDrift.workItems[0].title = `${sourceIdentityDrift.workItems[0].title} drift`;
  assert.throws(
    () => buildProjectBoardOwnerExport(sourceIdentityDrift, bytes),
    /registry argument must exactly match mazer-owner-work-registry source bytes/,
  );

  const duplicate = structuredClone(registry);
  duplicate.workItems[1].id = duplicate.workItems[0].id;
  assert.throws(() => buildProjectBoardOwnerExport(duplicate, { ...bytes, "mazer-owner-work-registry": JSON.stringify(duplicate) }), /unique stable MAZER ids/);

  const missing = structuredClone(registry);
  missing.workItems.pop();
  assert.throws(() => buildProjectBoardOwnerExport(missing, { ...bytes, "mazer-owner-work-registry": JSON.stringify(missing) }), /stable identity denominator/);

  const unsupported = structuredClone(registry);
  const completed = unsupported.workItems.find((item) => item.status === "completed");
  completed.status = "complete_typo";
  unsupported.provenance.completedExcludedCount -= 1;
  assert.throws(
    () => buildProjectBoardOwnerExport(unsupported, { ...bytes, "mazer-owner-work-registry": JSON.stringify(unsupported) }),
    /unsupported lifecycle status/,
  );

  const badSource = structuredClone(registry);
  badSource.workItems[0].sourceRef = "docs/roadmap.md#active-lane";
  assert.throws(() => buildProjectBoardOwnerExport(badSource, { ...bytes, "mazer-owner-work-registry": JSON.stringify(badSource) }), /sourceRef is not bound/);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mazer-owner-export-"));
  try {
    for (const relativePath of ["config/mazer-owner-work-registry.json", "docs/current-truth.md", "docs/roadmap.md", "docs/mobile-plan.md", "scripts/export-project-board-owner.mjs"]) {
      const target = path.join(temp, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, relativePath), target);
    }
    fs.mkdirSync(path.join(temp, "exports"), { recursive: true });
    const exportPath = path.join(temp, "exports/mazer.project-board.owner-export.v1.json");
    fs.writeFileSync(exportPath, "{}\n");
    assert.throws(() => runProjectBoardOwnerExport(["--check"], temp), /stale/);

    const canonical = renderProjectBoardOwnerExport(temp);
    for (const [label, driftedBytes] of [
      ["CRLF", canonical.replace(/\n/g, "\r\n")],
      ["UTF-8 BOM", `\uFEFF${canonical}`],
      ["trailing bytes", `${canonical} `],
    ]) {
      fs.writeFileSync(exportPath, driftedBytes, "utf8");
      assert.throws(() => runProjectBoardOwnerExport(["--check"], temp), /stale/, label);
    }
    fs.writeFileSync(exportPath, canonical, "utf8");
    assert.doesNotThrow(() => runProjectBoardOwnerExport(["--check"], temp));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
