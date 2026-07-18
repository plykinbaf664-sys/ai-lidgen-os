import type {
  ContactRecommendedNextAction,
  IdentityChannel,
  IdentityChannelOwnership,
  IdentityProfile,
  LeadgenContact,
  PeopleDiscoveryResult,
  PersonCandidate,
  PersonIntelligence,
} from "@/lib/leadgen/types";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";

function getContactValue(contact: LeadgenContact): string | null {
  if (
    contact.contact_type === "confirmed_person" ||
    contact.contact_type === "role_based_person"
  ) {
    return null;
  }

  return (
    contact.email ??
    contact.linkedin_url ??
    contact.telegram_url ??
    (typeof contact.metadata.phone === "string" ? contact.metadata.phone : null) ??
    contact.contact_url
  );
}

function getContactUrl(contact: LeadgenContact): string | null {
  if (
    contact.contact_type === "confirmed_person" ||
    contact.contact_type === "role_based_person"
  ) {
    return null;
  }

  return (
    contact.linkedin_url ??
    contact.telegram_url ??
    contact.contact_url ??
    (contact.email ? `mailto:${contact.email}` : null)
  );
}

function getChannelLabel(contact: LeadgenContact): string {
  if (contact.full_name && contact.role_title) {
    return `${contact.full_name}, ${contact.role_title}`;
  }

  if (contact.full_name) {
    return contact.full_name;
  }

  const labels: Record<LeadgenContact["contact_type"], string> = {
    work_email: "Confirmed work email",
    linkedin: "LinkedIn profile",
    telegram: "Telegram",
    phone: "Work phone",
    website_form: "Company contact/demo form",
    company_social: "Company social profile",
    confirmed_person: "Confirmed person",
    role_based_person: "Role-based person",
    generic_email: "Generic company email",
    contact_form: "Contact form",
    social_profile: "Social profile",
    company_website: "Company website",
    no_contact_found: "No contact found",
  };

  return labels[contact.contact_type];
}

function getChannelTier(contact: LeadgenContact): IdentityChannel["tier"] {
  if (contact.contact_type === "work_email") {
    return 1;
  }

  if (contact.contact_type === "generic_email") {
    return 2;
  }

  if (
    contact.contact_type === "linkedin" ||
    contact.contact_type === "telegram" ||
    contact.contact_type === "phone" ||
    contact.contact_type === "social_profile" ||
    contact.contact_type === "website_form" ||
    contact.contact_type === "contact_form" ||
    contact.contact_type === "company_social"
  ) {
    return 3;
  }

  return 4;
}

function getOwnership(contact: LeadgenContact): IdentityChannelOwnership {
  if (contact.metadata.people_discovery_role === "primary") {
    return "primary_person";
  }

  if (contact.metadata.people_discovery_role === "alternative") {
    return "alternative_person";
  }

  if (contact.department) {
    return "department";
  }

  if (
    contact.contact_type === "website_form" ||
    contact.contact_type === "generic_email" ||
    contact.contact_type === "company_social" ||
    contact.contact_type === "company_website"
  ) {
    return "company";
  }

  return "unknown";
}

function canUseForOutreach(contact: LeadgenContact): boolean {
  return isSendableEmailContact(contact) || isFallbackEmailContact(contact);
}

function toIdentityChannel(contact: LeadgenContact): IdentityChannel {
  const ownership = getOwnership(contact);
  const tier = getChannelTier(contact);

  return {
    id: contact.id,
    contact_type: contact.contact_type,
    label: getChannelLabel(contact),
    value: getContactValue(contact),
    url: getContactUrl(contact),
    tier,
    ownership,
    confidence_score: contact.confidence_score,
    source_label: contact.source_label,
    source_url: contact.source_url,
    can_use_for_outreach: canUseForOutreach(contact),
    why_selected:
      ownership === "primary_person"
        ? "Channel is tied to the primary person selected by People Discovery."
        : tier <= 2
          ? "Channel is tied to a discovered person but not the primary target."
          : "Channel is a confirmed company-level fallback, not a personal identity.",
  };
}

function channelRank(channel: IdentityChannel): number {
  const typePriority: Record<IdentityChannel["contact_type"], number> = {
    work_email: 140,
    generic_email: 120,
    linkedin: 60,
    telegram: 55,
    phone: 50,
    social_profile: 45,
    role_based_person: 1,
    confirmed_person: 1,
    website_form: 65,
    contact_form: 65,
    company_social: 55,
    company_website: 35,
    no_contact_found: 0,
  };
  const ownershipBonus =
    channel.ownership === "primary_person"
      ? 40
      : channel.ownership === "alternative_person"
        ? 20
        : channel.ownership === "department"
          ? 10
          : 0;

  return typePriority[channel.contact_type] + ownershipBonus + channel.confidence_score;
}

function getPrimaryPersonIntelligence(
  peopleDiscovery: PeopleDiscoveryResult,
): PersonIntelligence | null {
  return peopleDiscovery.primary_person_intelligence ?? null;
}

function getIdentityConfidence({
  person,
  personIntelligence,
  primaryChannel,
}: {
  person: PersonCandidate | null;
  personIntelligence: PersonIntelligence | null;
  primaryChannel: IdentityChannel | null;
}): number {
  const base = personIntelligence?.confidence_score ?? person?.confidence_score ?? 0;
  const channelBonus =
    primaryChannel?.ownership === "primary_person"
      ? 18
      : primaryChannel?.ownership === "alternative_person"
        ? 8
        : 0;

  return Math.min(Math.max(Math.round(base * 0.75 + channelBonus), 0), 100);
}

function getMissingChannels(channels: IdentityChannel[]): string[] {
  const has = (type: IdentityChannel["contact_type"]) =>
    channels.some((channel) => channel.contact_type === type);

  return [
    !has("work_email") ? "confirmed work email" : null,
    !has("linkedin") ? "LinkedIn profile" : null,
    !has("telegram") ? "Telegram" : null,
    !has("phone") ? "work phone" : null,
  ].filter((value): value is string => Boolean(value));
}

function getRecommendedNextAction({
  primaryChannel,
  fallbackChannel,
}: {
  primaryChannel: IdentityChannel | null;
  fallbackChannel: IdentityChannel | null;
}): ContactRecommendedNextAction {
  if (primaryChannel?.contact_type === "work_email" && primaryChannel.value) {
    return "send_outreach";
  }

  if (fallbackChannel?.contact_type === "generic_email" && fallbackChannel.value) {
    return "use_fallback_channel";
  }

  return "run_enrichment";
}

export function buildIdentityProfile({
  peopleDiscovery,
  contacts,
  bestOutreachEntry,
  fallbackEntry,
}: {
  peopleDiscovery: PeopleDiscoveryResult;
  contacts: LeadgenContact[];
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
}): IdentityProfile {
  const person = peopleDiscovery.primary_person;
  const personIntelligence = getPrimaryPersonIntelligence(peopleDiscovery);
  const availableChannels = contacts
    .filter(
      (contact) =>
        contact.contact_type !== "confirmed_person" &&
        contact.contact_type !== "role_based_person",
    )
    .map(toIdentityChannel)
    .sort((left, right) => channelRank(right) - channelRank(left));
  const bestOutreachChannel = bestOutreachEntry
    ? availableChannels.find((channel) => channel.id === bestOutreachEntry.id) ??
      null
    : null;
  const fallbackChannel = fallbackEntry
    ? availableChannels.find((channel) => channel.id === fallbackEntry.id) ?? null
    : null;
  const primaryContactChannel =
    bestOutreachChannel ??
    availableChannels.find(
      (channel) =>
        channel.ownership === "primary_person" && channel.can_use_for_outreach,
    ) ??
    null;
  const alternativeChannels = availableChannels.filter(
    (channel) =>
      channel.id !== primaryContactChannel?.id &&
      channel.id !== fallbackChannel?.id &&
      channel.contact_type !== "no_contact_found",
  );
  const identityConfidence = getIdentityConfidence({
    person,
    personIntelligence,
    primaryChannel: primaryContactChannel,
  });
  const recommendedNextAction = getRecommendedNextAction({
    primaryChannel: primaryContactChannel,
    fallbackChannel,
  });

  return {
    person,
    person_intelligence: personIntelligence,
    identity_confidence: identityConfidence,
    identity_summary: person
      ? `Identity profile created for ${person.full_name}. ${
          primaryContactChannel
            ? `Best confirmed channel: ${primaryContactChannel.label}.`
            : "No confirmed personal contact found."
        }`
      : "No person identity found yet. Company-level fallback channels were checked.",
    available_channels: availableChannels,
    primary_contact_channel: primaryContactChannel,
    fallback_channel: fallbackChannel,
    alternative_channels: alternativeChannels,
    missing_channels: getMissingChannels(availableChannels),
    recommended_next_action: recommendedNextAction,
    why_channel_selected: primaryContactChannel
      ? (primaryContactChannel.why_selected ??
        "Selected by channel priority, ownership, source, and confidence.")
      : fallbackChannel
        ? "No confirmed personal channel exists; selected the best confirmed fallback."
        : "No confirmed personal or fallback channel exists.",
  };
}
