"use client";

import { UserButton } from "@clerk/nextjs";
import { Mic2 } from "lucide-react";
import { CASTER_STUDIO_PATH } from "@/lib/caster/routes";

const hiddenDangerElements = {
  navbarButton__danger: {
    display: "none",
  },
  profileSection__danger: {
    display: "none",
  },
};

export default function IronCladUserButton({ studioLabel }: { studioLabel?: string } = {}) {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-11 w-11",
          userButtonTrigger:
            "h-11 w-11 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
        },
      }}
      userProfileProps={{
        appearance: {
          elements: hiddenDangerElements,
        },
      }}
    >
      {studioLabel && (
        <UserButton.MenuItems>
          <UserButton.Link href={CASTER_STUDIO_PATH} label={studioLabel} labelIcon={<Mic2 aria-hidden="true" size={16} />} />
        </UserButton.MenuItems>
      )}
    </UserButton>
  );
}
