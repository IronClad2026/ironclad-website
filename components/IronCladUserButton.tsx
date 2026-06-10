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
      userProfileProps={{
        appearance: {
          elements: hiddenDangerElements,
        },
      }}
    />
  );
}
