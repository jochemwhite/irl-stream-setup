export type MetricMap = Map<string, number>;

export function parseMetrics(text: string): MetricMap {
  const map = new Map<string, number>();

  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;

    const m = line.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*(?:\{[^}]*\})?)\s+([\d.e+\-]+)$/
    );

    if (!m) continue;

    map.set(m[1], Number(m[2]));
  }

  return map;
}

export function getMetric(
  map: MetricMap,
  name: string,
  labels: Record<string, string> = {}
): number | null {
  for (const [key, value] of map.entries()) {
    if (key !== name && !key.startsWith(name + "{")) continue;

    const labelStr = key.includes("{")
      ? key.slice(key.indexOf("{") + 1, -1)
      : "";

    let ok = true;

    for (const [k, v] of Object.entries(labels)) {
      if (!labelStr.includes(`${k}="${v}"`)) {
        ok = false;
        break;
      }
    }

    if (ok) return value;
  }

  return null;
}

export function getAllMetrics(
  map: MetricMap,
  name: string,
  labels: Record<string, string> = {}
) {
  const out: {
    labels: Record<string, string>;
    value: number;
  }[] = [];

  for (const [key, value] of map.entries()) {
    if (key !== name && !key.startsWith(name + "{")) continue;

    const labelStr = key.includes("{")
      ? key.slice(key.indexOf("{") + 1, -1)
      : "";

    let ok = true;

    for (const [k, v] of Object.entries(labels)) {
      if (!labelStr.includes(`${k}="${v}"`)) {
        ok = false;
        break;
      }
    }

    if (!ok) continue;

    const parsedLabels: Record<string, string> = {};

    for (const part of labelStr.split(",")) {
      const m = part.match(/(\w+)="([^"]+)"/);

      if (m) parsedLabels[m[1]] = m[2];
    }

    out.push({
      labels: parsedLabels,
      value
    });
  }

  return out;
}