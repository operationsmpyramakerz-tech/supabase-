/**
 * Branded, mobile-friendly Users Center invitation email.
 * Use presentation tables, inline styles, and publicly served PNG assets so
 * the invitation works in Gmail/Outlook without JavaScript or CSS imports.
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

export function renderUsersCenterMemberInviteEmail({ name, username, password, loginUrl, imageBaseUrl }) {
  const safeName = escapeHtml(name || "Team Member");
  const safeUsername = escapeHtml(username);
  const safePassword = escapeHtml(password);
  const safeLogin = escapeHtml(loginUrl);
  const safeBase = escapeHtml(imageBaseUrl);
  const logo = `${safeBase}/Logo%20horizontal.png`;
  const invitationArt = `${safeBase}/erp-invite-illustration.png`;
  const topCorner = `${safeBase}/erp-invite-corner-top.png`;
  const bottomCorner = `${safeBase}/erp-invite-corner-bottom.png`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f3f8;color:#141b2b;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f3f8;width:100%;border-collapse:collapse;">
<tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#fff;border:1px solid #e1e5eb;border-radius:22px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:0;vertical-align:top;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
<tr><td valign="middle" style="padding:22px 0 16px 24px;vertical-align:middle;">
<img src="${logo}" width="247" alt="Pyramakerz" style="display:block;width:247px;max-width:100%;height:auto;border:0;color:#ff7414;font-size:23px;font-weight:800;">
<div style="padding:3px 0 0 52px;font-size:10px;letter-spacing:2.4px;line-height:1.45;font-weight:700;color:#596172;">OPERATIONS ERP</div>
</td><td align="right" valign="top" width="145" style="width:145px;vertical-align:top;padding:0;">
<img src="${topCorner}" width="145" alt="" style="display:block;width:145px;max-width:100%;height:auto;border:0;">
</td></tr></table></td></tr>
<tr><td style="height:1px;line-height:1px;background:#e8ebf1;font-size:1px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:20px 24px 8px;">
<img src="${invitationArt}" width="207" height="146" alt="Invitation" style="display:block;margin:0 auto;width:207px;max-width:100%;height:auto;border:0;">
<div style="padding-top:2px;font-size:31px;line-height:1.15;font-weight:800;letter-spacing:-.6px;color:#131a29;">You're Invited to</div>
<div style="font-size:32px;line-height:1.2;font-weight:800;letter-spacing:-.6px;color:#ff7414;">Pyramakerz ERP</div>
</td></tr>
<tr><td style="padding:20px 26px 0;text-align:left;font-size:15px;line-height:1.55;color:#182031;">
<p style="margin:0 0 8px;">Hello <strong style="font-weight:700;">${safeName}</strong>,</p>
<p style="margin:0;">An account has been created for you on the <strong>Pyramakerz Operations ERP</strong>. You can now sign in using the details below.</p>
</td></tr>
<tr><td style="padding:20px 20px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f6f8fb;border:1px solid #dce2ec;border-radius:14px;border-collapse:separate;">
<tr><td align="center" width="52" style="width:52px;padding:13px 8px;font-size:21px;color:#182031;">&#9678;</td><td style="padding:13px 12px 11px 0;line-height:1.4;word-break:break-word;">
<strong style="font-size:13px;color:#182031;">Application</strong><br><a href="${safeLogin}" style="font-size:13px;color:#1d6ad4;text-decoration:underline;word-break:break-all;">${safeLogin}</a>
</td></tr>
<tr><td colspan="2" style="padding:0 14px;"><div style="height:1px;background:#dfe4eb;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td align="center" style="padding:12px 8px;font-size:22px;">&#9786;</td><td style="padding:12px 12px 11px 0;line-height:1.4;word-break:break-word;"><strong style="font-size:13px;">Username</strong><br><span style="font-size:15px;font-weight:700;">${safeUsername}</span></td></tr>
<tr><td colspan="2" style="padding:0 14px;"><div style="height:1px;background:#dfe4eb;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td align="center" style="padding:12px 8px;font-size:20px;">&#128274;</td><td style="padding:12px 12px 14px 0;line-height:1.4;word-break:break-word;"><strong style="font-size:13px;">Password</strong><br><span style="font-size:15px;font-weight:700;">${safePassword}</span></td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:22px 28px 0;">
<a href="${safeLogin}" style="display:block;text-align:center;background:#ff7815;color:#fff;text-decoration:none;border-radius:26px;padding:14px 16px;font-size:18px;line-height:1.15;font-weight:800;">&#10140;&nbsp; Open ERP</a>
</td></tr>
<tr><td style="padding:20px 20px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f3f5f9;border-radius:11px;">
<tr><td width="38" valign="top" align="center" style="padding:13px 0 13px 10px;font-size:20px;color:#34435a;">&#9432;</td><td valign="top" style="padding:12px 13px 12px 5px;font-size:12px;line-height:1.55;color:#49556c;">Keep these login details confidential. If you did not expect this invitation, please contact your administrator.</td></tr>
</table></td></tr>
<tr><td style="padding:24px 25px 0;"><div style="height:1px;background:#e5e8ee;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td align="center" style="padding:16px 15px 3px;font-size:11px;line-height:1.7;color:#5d6778;">
<strong style="color:#131a29;">Pyramakerz Technologies</strong><br>Operations ERP &nbsp;&middot;&nbsp; Automated Communication
</td></tr>
<tr><td align="right" style="padding:0;line-height:0;font-size:0;"><img src="${bottomCorner}" width="210" alt="" style="display:block;width:210px;max-width:100%;height:auto;margin-left:auto;border:0;"></td></tr>
</table>
</td></tr></table>
</body></html>`;
}
