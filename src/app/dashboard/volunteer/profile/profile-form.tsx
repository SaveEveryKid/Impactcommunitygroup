"use client";

import { useActionState } from "react";
import { saveVolunteerProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, TextField } from "@/components/ui/field";
import { PILLARS, PILLAR_META } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

type Profile = {
  interests: string[];
  causes: string[];
  skills: string[];
  availability: Record<string, boolean>;
  service_areas: string[];
  max_distance_miles: number | null;
  is_discoverable: boolean;
} | null;

const AVAILABILITY = [
  ["weekday_mornings", "Weekday mornings"],
  ["weekday_afternoons", "Weekday afternoons"],
  ["weekday_evenings", "Weekday evenings"],
  ["weekends", "Weekends"],
  ["remote", "Remote / from home"],
] as const;

export function VolunteerProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVolunteerProfile, {});
  return (
    <form action={action} className="flex flex-col gap-8">
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold">What do you care about?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <label key={p} className="flex items-center gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="interests" value={p} defaultChecked={profile?.interests?.includes(p)} className="h-5 w-5 accent-[var(--teal)]" />
              {PILLAR_META[p].label}
            </label>
          ))}
        </div>
        <TextField className="mt-4" label="Causes" name="causes" defaultValue={profile?.causes?.join(", ")} hint="Comma-separated, e.g. hunger, literacy, veterans" />
      </fieldset>
      <TextField label="Skills" name="skills" defaultValue={profile?.skills?.join(", ")} hint="Comma-separated, e.g. driving, Spanish, carpentry, accounting" />
      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold">When are you usually free?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AVAILABILITY.map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="availability" value={k} defaultChecked={Boolean(profile?.availability?.[k])} className="h-5 w-5 accent-[var(--teal)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
        <TextField label="Areas you can reach" name="service_areas" defaultValue={profile?.service_areas?.join(", ")} hint="Towns or neighborhoods, comma-separated" />
        <TextField label="Max distance (miles)" name="max_distance_miles" type="number" min={1} max={500} inputMode="numeric" defaultValue={profile?.max_distance_miles ?? ""} />
      </div>
      <Checkbox
        name="is_discoverable"
        defaultChecked={profile?.is_discoverable}
        label="Let coordinators of approved organizations see that I'm interested in volunteering"
        hint="Your email is never shown. Organizations can only reach you through platform messages."
      />
      <div>
        <Button type="submit" size="lg" pending={pending}>
          Save preferences
        </Button>
      </div>
    </form>
  );
}
