// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import type { Profile } from "./api.ts";
import { fetchProfile, updateProfile } from "./api.ts";

export function ProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProfile().then((p) => {
      setProfile(p);
      setTags(p.tags);
    });
  }, []);

  if (!profile) return <main className="card">Loading…</main>;

  const edit = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setProfile({ ...profile, [field]: e.target.value });
  };

  async function saveProfile() {
    const data = await updateProfile({
      name: profile!.name,
      email: profile!.email,
      bio: profile!.bio,
    });
    // Written against v1 of the API, which returned { user: … }. v2 returns { profile: … }.
    setTags(data.user.tags.map((t: string) => t.toLowerCase()));
    setSaved(true);
  }

  return (
    <main className="card">
      <h1>Edit profile</h1>
      <label>
        Name
        <input value={profile.name} onChange={edit("name")} />
      </label>
      <label>
        Email
        <input value={profile.email} onChange={edit("email")} />
      </label>
      <label>
        Bio
        <input value={profile.bio} onChange={edit("bio")} />
      </label>
      <div className="tags">
        {tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="actions">
        <button onClick={saveProfile}>Save</button>
        {saved && <span className="saved">Saved ✓</span>}
      </div>
    </main>
  );
}
