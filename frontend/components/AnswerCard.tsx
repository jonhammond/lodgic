import { Pressable, PressableStateCallbackType, ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts, radius, tabular } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

type Props = {
  status: "idle" | "loading" | "error" | "rate_limited";
  headline: string | null;
  findings: string | null;
  facts: string[];
  caveat: string | null;
  errorMessage: string | null;
  period: string | null;
  periodSource: "question" | "default" | null;
  rowCount: number | null;
  durationMs: number | null;
  sql: string | null;
  sqlOpen: boolean;
  onToggleSql: () => void;
  onResetRateLimit: () => void;
};

const hovered = (s: PressableStateCallbackType) =>
  Boolean((s as PressableStateCallbackType & { hovered?: boolean }).hovered);

export function AnswerCard({
  status,
  headline,
  findings,
  facts,
  caveat,
  errorMessage,
  period,
  periodSource,
  rowCount,
  durationMs,
  sql,
  sqlOpen,
  onToggleSql,
  onResetRateLimit,
}: Props) {
  const { t } = useTheme();
  const meta = [
    period ? (periodSource === "default" ? `${period} (default)` : period) : null,
    rowCount != null ? `${rowCount} rows` : null,
    durationMs != null ? `${durationMs} ms` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const paragraph = findings?.trim() ? findings.trim() : facts.length > 0 ? facts.join(" ") : null;
  const summaryText = headline ? (
    <Text style={[styles.headline, { color: t.text.primary }]}>{headline}</Text>
  ) : null;
  const caveatText = (text: string) => (
    <Text style={[styles.caveat, { color: t.text.muted }]}>{text}</Text>
  );

  let body;
  if (status === "loading") {
    body = (
      <>
        <Skeleton h={22} w="90%" />
        <Skeleton h={14} w="60%" />
        {summaryText}
      </>
    );
  } else if (status === "error") {
    body = (
      <>
        <Text style={[styles.body, { color: t.delta.error }]}>{errorMessage}</Text>
        {summaryText}
      </>
    );
  } else if (status === "rate_limited") {
    body = (
      <>
        {summaryText}
        {caveatText("Rate limit reached — 20 queries per hour. Try again later.")}
        <Pressable onPress={onResetRateLimit} accessibilityRole="link" style={styles.link}>
          {(s) => (
            <Text style={[styles.body, { color: hovered(s) ? t.accent.linkHover : t.accent.link }]}>
              Try again
            </Text>
          )}
        </Pressable>
      </>
    );
  } else if (headline) {
    body = (
      <>
        {summaryText}
        {paragraph ? <Text style={[styles.findings, { color: t.text.secondary }]}>{paragraph}</Text> : null}
        {caveat ? caveatText(caveat) : null}
      </>
    );
  } else {
    body = <Text style={[styles.body, { color: t.text.muted }]}>Ask a question or pick a suggestion.</Text>;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text.primary }]}>Answer</Text>
        {meta ? <Text style={[styles.meta, { color: t.text.subtle }]}>{meta}</Text> : null}
      </View>
      {body}
      {sqlOpen && sql ? (
        <ScrollView
          horizontal
          style={[styles.codeBox, { backgroundColor: t.bg.code, borderRadius: radius.input }]}
          contentContainerStyle={styles.codeInner}
        >
          <Text selectable style={[styles.code, { color: t.text.secondary }]}>
            {sql}
          </Text>
        </ScrollView>
      ) : null}
      {sql ? (
        <Pressable onPress={onToggleSql} accessibilityRole="button" style={styles.link}>
          {(s) => (
            <Text style={[styles.body, { color: hovered(s) ? t.accent.linkHover : t.accent.link }]}>
              {sqlOpen ? "Hide generated SQL" : "View generated SQL →"}
            </Text>
          )}
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, paddingHorizontal: 18, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { fontFamily: fonts.sans700, fontSize: 13 },
  meta: { fontFamily: fonts.mono400, fontSize: 11, ...tabular },
  body: { fontFamily: fonts.sans400, fontSize: 13 },
  headline: { fontFamily: fonts.sans500, fontSize: 16, lineHeight: 22 },
  findings: { fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19 },
  caveat: { fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19.5 },
  link: { alignSelf: "flex-start" },
  codeBox: { flexGrow: 0 },
  codeInner: { paddingVertical: 14, paddingHorizontal: 16 },
  code: { fontFamily: fonts.mono400, fontSize: 12, lineHeight: 19 },
});
