"use client";

import { UserButton } from "@clerk/nextjs";

const hiddenDangerElements = {
  navbarButton__danger: {
    display: "none",
  },
  profileSection__danger: {
    display: "none",
  },
};

export default function IronCladUserButton() {
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
    />
  );
}
