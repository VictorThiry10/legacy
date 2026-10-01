import "server-only";
import nodemailer from "nodemailer";
import { commissionerEmail } from "./supabase/server";

// League emails, sent from the commissioner's Gmail. Needs GMAIL_APP_PASSWORD in Vercel (a Google app password).
// Without it nothing is sent and the caller carries on: email is a nice-to-have, never a blocker.
export async function sendMail(o: { to: string; subject: string; html: string }): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!pass) return false;
  const user = process.env.GMAIL_USER || commissionerEmail();
  try {
    const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await mail.sendMail({ from: `"Legacy League" <${user}>`, to: o.to, subject: o.subject, html: o.html });
    return true;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A simple email: title, a few lines, one green button.
export function emailHtml(o: { title: string; lines: string[]; button: { label: string; href: string } }) {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
  <h2 style="margin:0 0 16px;font-size:20px">${esc(o.title)}</h2>
  ${o.lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.4">${l}</p>`).join("\n  ")}
  <p style="margin:24px 0"><a href="${esc(o.button.href)}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">${esc(o.button.label)}</a></p>
  <p style="margin:0;font-size:12px;color:#78716c">Legacy League</p>
</div>`;
}

export { esc };
