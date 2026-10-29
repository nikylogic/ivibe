// SPDX-License-Identifier: AGPL-3.0-only

export type Profile = { name: string; email: string; bio: string; tags: string[] };

export async function fetchProfile(): Promise<Profile> {
  const res = await fetch("/api/profile");
  const data = await res.json();
  return data.profile;
}

export async function updateProfile(patch: Partial<Profile>) {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}
