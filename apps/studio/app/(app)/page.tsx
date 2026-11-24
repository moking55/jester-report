import { cookies } from "next/headers";
import Link from "next/link";

import { CatalogFilters } from "@/components/CatalogFilters";
import { CreateTemplate } from "@/components/CreateTemplate";
import { ImportDialog } from "@/components/ImportDialog";
import { TagChips } from "@/components/TagChip";
import { TemplateMenu } from "@/components/TemplateMenu";
import { ViewToggle } from "@/components/ViewToggle";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { sizeLabel } from "@/lib/paper";
import { VIEW_COOKIE } from "@/lib/session";
import { colorMap, colorsOf, hasAllTags, tagsFromQuery } from "@/lib/tags";
import type { components } from "@/lib/types.gen";

import styles from "./catalog.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];
type TagUse = components["schemas"]["TagUse"];

/** The last render as a pill; everything comes with the catalog list, so no request per card. */
function LastRun({ run }: { run: TemplateSummary["lastRun"] }) {
  if (!run)
    return (
      <span className={`${styles.pill} ${styles.none}`}>ยังไม่เคย render</span>
    );
  return run.status === "succeeded" ? (
    <span className={`${styles.pill} ${styles.ok}`}>
      <span className={styles.dot} />
      Render ล่าสุดผ่าน · {run.pages ?? "?"} หน้า
    </span>
  ) : (
    <span className={`${styles.pill} ${styles.err}`}>
      <span className={styles.dot} />
      Render ล่าสุดล้มเหลว · {run.errorCode ?? "?"}
    </span>
  );
}

/** Only a published, active template can issue documents (SPEC-studio v1.4: the published version). */
function IssueLink({
  t,
  className,
}: {
  t: TemplateSummary;
  className?: string;
}) {
  if (t.publishedVersion === null || t.archivedAt) return null;
  return (
    <Link href={`/templates/${t.id}?mode=issue`} className={className}>
      ออกเอกสาร
    </Link>
  );
}

/** Documents exist only for templates that were published; an archived one keeps its documents. */
function DocumentsLink({
  t,
  className,
}: {
  t: TemplateSummary;
  className?: string;
}) {
  if (t.publishedVersion === null) return null;
  return (
    <Link href={`/documents?template=${t.id}`} className={className}>
      เอกสารที่ออก
    </Link>
  );
}

/** The sheet on a catalog card: the size, the orientation of a sheet, and a free layout's name. */
function pageLabel(page: TemplateSummary["page"]): string {
  const size = page?.size ?? "A4";
  if (size === "roll") return sizeLabel("roll", page?.rollWidthMm);
  const sheet = `${sizeLabel(size)} ${page?.orientation === "landscape" ? "แนวนอน" : "แนวตั้ง"}`;
  return page?.layout === "free" ? `${sheet} · อิสระ` : sheet;
}

function Archived({ t }: { t: TemplateSummary }) {
  return t.archivedAt ? (
    <span className={`${styles.pill} ${styles.none}`}>archive แล้ว</span>
  ) : null;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string; status?: string; tag?: string | string[] }>;
}) {
  const params = await searchParams;
  const withArchived = params.archived === "1";
  const q = (params.q ?? "").trim();
  const status = params.status ?? "";
  const wanted = tagsFromQuery(params.tag);
  const [templates, uses] = await Promise.all([
    api<TemplateSummary[]>(withArchived ? "/v1/templates?includeArchived=true" : "/v1/templates"),
    api<TagUse[]>("/v1/tags"),
  ]);
  const colors = colorMap(uses);
  // the tags a report in this catalog carries, to filter by; chosen ones stay listed even when nothing has them now
  const options = uses.filter((u) => u.templates > 0 || wanted.includes(u.tag));
  const view =
    (await cookies()).get(VIEW_COOKIE)?.value === "cards" ? "cards" : "table";
  const needle = q.toLowerCase();
  const shown = templates.filter(
    (t) =>
      (!needle ||
        t.name.toLowerCase().includes(needle) ||
        t.id.includes(needle) ||
        t.tags.some((tag) => tag.toLowerCase().includes(needle))) &&
      hasAllTags(t.tags, wanted) &&
      (status === "published"
        ? t.publishedVersion !== null
        : status === "draft"
          ? t.publishedVersion === null
          : status === "changed"
            ? t.draftChangedSincePublish
            : true),
  );
  const back = withArchived ? "/?archived=1" : "/"; // where the menu goes after an archive or a restore
  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <h1>รายงาน</h1>
        <ImportDialog className={styles.import} />
        <ImportDialog className={styles.import} word />
        <ViewToggle view={view} />
      </div>
      <p className={styles.sub}>
        {shown.length === templates.length
          ? `${templates.length} รายงาน`
          : `${shown.length} จาก ${templates.length} รายงาน`}{" "}
        · เปิดเพื่อแก้ template ดูตัวอย่าง PDF และ publish
      </p>
      <div className={styles.bar}>
        <CreateTemplate className={styles.create} />
        <CatalogFilters
          key={`${status}|${withArchived}|${wanted.join(",")}`}
          q={q}
          status={status}
          archived={withArchived}
          tags={wanted}
          options={options.map((u) => ({ tag: u.tag, color: u.color, count: u.templates }))}
        />
      </div>
      {shown.length === 0 ? (
        <p className={styles.sub}>
          {templates.length === 0
            ? "ยังไม่มีรายงาน กด + สร้างรายงาน เพื่อเริ่มจาก starter"
            : "ไม่มีรายงานที่ตรงกับตัวกรอง"}
        </p>
      ) : view === "table" ? (
        <Table templates={shown} back={back} colors={colors} />
      ) : (
        <Cards templates={shown} back={back} colors={colors} />
      )}
    </section>
  );
}

function Table({
  templates,
  back,
  colors,
}: {
  templates: TemplateSummary[];
  back: string;
  colors: Record<string, string>;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>ชื่อ</th>
          <th>id</th>
          <th>tag</th>
          <th>Published</th>
          <th>Draft</th>
          <th>Render ล่าสุด</th>
          <th>แก้ล่าสุด</th>
          <th aria-label="เมนู" />
        </tr>
      </thead>
      <tbody>
        {templates.map((t) => (
          <tr key={t.id}>
            <td>
              <Link href={`/templates/${t.id}`}>{t.name}</Link>{" "}
              <Archived t={t} />
            </td>
            <td>
              <code>{t.id}</code>
            </td>
            <td>
              <TagChips tags={t.tags} colors={colors} />
            </td>
            <td>
              {t.publishedVersion === null ? "—" : `v${t.publishedVersion}`}
            </td>
            <td>
              r{t.draftRevision}
              {t.draftChangedSincePublish && (
                <span className={styles.changed}> แก้หลัง publish</span>
              )}
            </td>
            <td>
              <LastRun run={t.lastRun} />
            </td>
            <td>{when(t.updatedAt)}</td>
            <td className={styles.actions}>
              <IssueLink t={t} className={styles.issue} />
              <DocumentsLink t={t} className={styles.documents} />
              <TemplateMenu
                templateId={t.id}
                archived={Boolean(t.archivedAt)}
                back={back}
                name={t.name}
                tags={t.tags}
                colors={colorsOf(t.tags, colors)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cards({
  templates,
  back,
  colors,
}: {
  templates: TemplateSummary[];
  back: string;
  colors: Record<string, string>;
}) {
  return (
    <div className={styles.grid}>
      {templates.map((t) => (
        <article key={t.id} className={styles.card}>
          <h3>
            <span className={styles.docIcon} aria-hidden="true" />
            {t.name}
          </h3>
          <div className={styles.meta}>
            <code>{t.id}</code>
            <span>
              {t.publishedVersion === null
                ? "ยังไม่ publish"
                : `v${t.publishedVersion}`}{" "}
              · {pageLabel(t.page)}
            </span>
          </div>
          {t.tags.length > 0 && <TagChips tags={t.tags} colors={colors} />}
          <div className={styles.pills}>
            <Archived t={t} />
            <LastRun run={t.lastRun} />
            {t.draftChangedSincePublish && (
              <span className={`${styles.pill} ${styles.warn}`}>
                <span className={styles.dot} />
                draft แก้หลัง publish
              </span>
            )}
          </div>
          <div className={styles.meta}>
            draft r{t.draftRevision} · แก้ล่าสุด {when(t.updatedAt)}
          </div>
          <div className={styles.row}>
            <Link href={`/templates/${t.id}`} className={styles.open}>
              เปิด
            </Link>
            <IssueLink t={t} className={styles.issue} />
            <DocumentsLink t={t} className={styles.documents} />
            <TemplateMenu
              templateId={t.id}
              archived={Boolean(t.archivedAt)}
              back={back}
              name={t.name}
              tags={t.tags}
              colors={colorsOf(t.tags, colors)}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
