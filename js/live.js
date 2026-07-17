/**
 * The live galaxy. Ignitions persist in Supabase, so the page is never
 * the same twice: every visitor sees all previous lights, and new
 * ignitions appear in real time while you watch.
 *
 * Table: public.ignitions (id, name, dedicate, kind, action, created_at)
 * RLS: public read, constrained public insert. No amounts are stored.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bectjarxpemqdwbfaymj.supabase.co";
const SUPABASE_KEY = "sb_publishable_W_jw0OIYfeHJJGZv21j9Ig_WKxkHJTl";

/** Deterministically map an ignition id to a life in the galaxy. */
function hashToIndex(id, n) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % n;
}

export function setupLive(galaxy, { onRemoteIgnite, onCountChange } = {}) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const ownIds = new Set();
  let total = 0;

  function pickLife(id) {
    const n = galaxy.lives.length;
    let idx = hashToIndex(id, n);
    for (let tries = 0; tries < n; tries++) {
      const life = galaxy.lives[(idx + tries) % n];
      if (life !== galaxy.heroLife && !life.ignited) return life;
    }
    return null; // galaxy fully lit — a good problem
  }

  /** Load all previous ignitions and light them, settled. */
  async function load() {
    const { data, error, count } = await supabase
      .from("ignitions")
      .select("id", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) return; // offline / blocked: the page still works locally
    total = count ?? data.length;
    for (const row of data) {
      const life = pickLife(row.id);
      if (life) galaxy.igniteInstant(life);
    }
    onCountChange?.(total);
  }

  /** Persist a local ignition. Returns the share URL for this light. */
  async function publish(donation) {
    const row = {
      name: donation.anonymous ? null : donation.name,
      dedicate: donation.dedicate || null,
      kind: donation.kind,
      action: donation.kind === "action" ? donation.action : null,
    };
    const { data, error } = await supabase
      .from("ignitions")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) return null;
    ownIds.add(data.id);
    total += 1;
    onCountChange?.(total);
    const base = `${location.origin}${location.pathname}`;
    return `${base}?light=${data.id}`;
  }

  /** Someone else's donation lights a branch while you watch. */
  function subscribe(now) {
    supabase
      .channel("ignitions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ignitions" },
        (payload) => {
          const id = payload.new?.id;
          if (!id || ownIds.has(id)) return;
          const life = pickLife(id);
          if (life) {
            galaxy.igniteLife(life, now());
            total += 1;
            onCountChange?.(total);
            onRemoteIgnite?.(payload.new);
          }
        }
      )
      .subscribe();
  }

  /** ?light=<id> — greet a visitor arriving via a shared light. */
  async function resolveSharedLight() {
    const id = new URLSearchParams(location.search).get("light");
    if (!id) return null;
    const { data } = await supabase
      .from("ignitions")
      .select("name, dedicate, kind, action")
      .eq("id", id)
      .maybeSingle();
    return data || null;
  }

  return { load, publish, subscribe, resolveSharedLight, total: () => total };
}
