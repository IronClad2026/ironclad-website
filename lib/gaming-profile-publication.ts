export type GamingProfilePublication = {
  mode: "legacy" | "new";
  // Publication of optional profile details. Core gaming information has a separate policy.
  public: boolean;
  revision: number;
  objectionOpen: boolean;
};

export type GamingProfilePublicationActionState = {
  status: "idle" | "saved" | "conflict" | "unavailable";
  publication?: GamingProfilePublication;
};
