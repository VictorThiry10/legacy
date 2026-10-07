"use server";
import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { fail } from "@/lib/db";
import { guard, type ActionResult } from "@/lib/guard";
import { db } from "@/lib/supabase/server";
import { LOGO_BUCKET, TEAM_COLORS } from "@/lib/team-look";

// My team's badge: its colour, and a new photo or none. The photo arrives already cut to a small square JPEG
// (TeamLook does that in the browser), goes in the team's folder of the bucket, and the older ones are cleared out.
export async function saveLook(f: FormData): Promise<ActionResult> {
  return guard(async () => {
    const team = await requireTeam();
    const color = String(f.get("color") ?? "");
    if (color && !TEAM_COLORS.includes(color)) throw new Error("Pick one of the colours.");
    const photo = f.get("photo");
    const bucket = db().storage.from(LOGO_BUCKET);
    let logo: string | null | undefined; // undefined: the photo stays as it is
    if (photo instanceof File && photo.size) {
      if (photo.type !== "image/jpeg" || photo.size > 500_000) throw new Error("That photo didn't come through. Try another one.");
      const path = `${team.id}/${Date.now()}.jpg`; // a new name each time, so no phone keeps showing the old one
      const { error } = await bucket.upload(path, await photo.arrayBuffer(), { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error(`The photo couldn't be saved: ${error.message}`);
      logo = bucket.getPublicUrl(path).data.publicUrl;
    } else if (f.get("remove") === "1") logo = null;

    const { error } = await db().from("teams").update({ color: color || null, ...(logo !== undefined ? { logo_url: logo } : {}) }).eq("id", team.id);
    if (error) fail(error);

    if (logo !== undefined) {
      // the team's photos that are no longer shown (it never fails the save)
      const keep = logo?.split("/").pop();
      const { data: files } = await bucket.list(team.id);
      const old = (files ?? []).filter((x) => x.name !== keep).map((x) => `${team.id}/${x.name}`);
      if (old.length) await bucket.remove(old).catch(() => null);
    }
    revalidatePath("/", "layout"); // the badge is on every page
  });
}
