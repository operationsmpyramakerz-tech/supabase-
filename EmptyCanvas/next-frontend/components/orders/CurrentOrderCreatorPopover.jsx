"use client";

import { useEffect, useState } from "react";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";
import UnifiedOrderCreatorPopover from "./UnifiedOrderCreatorPopover";

export default function CurrentOrderCreatorPopover({ creator, onClose }) {
  const [state, setState] = useState({ loading: true, profile: null, error: false });
  useEffect(() => {
    let mounted = true;
    const key = creator?.id || creator?.name;
    setState({ loading: !!key, profile: null, error: false });
    if (key) loadTeamMemberPublicProfile(key)
      .then((profile) => { if (mounted) setState({ loading: false, profile, error: false }); })
      .catch(() => { if (mounted) setState({ loading: false, profile: null, error: true }); });
    return () => { mounted = false; };
  }, [creator?.id, creator?.name]);
  return <UnifiedOrderCreatorPopover state={{ ...state, name: creator?.name, placement: creator?.placement }} onClose={onClose} />;
}
