// app/trust/public/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../lib/colors";
import { supabase } from "../../../lib/supabase";

interface PublicTrustProfile {
  organization_name: string;
  logo_url: string | null;
  verification_tier: string;
  overall_score: number;
  verified_at: string | null;
  total_sales: number;
  days_active: number;
  is_verified: boolean;
}

export default function PublicTrustProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const orgId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicTrustProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      loadPublicProfile();
    }
  }, [orgId]);

  async function loadPublicProfile() {
    try {
      setLoading(true);
      setError(null);

      // Call the public profile function (no auth required)
      const { data, error } = await supabase
        .from("public_trust_profiles")
        .select("*")
        .eq("organization_id", orgId)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Profile not found");

      setProfile(data);
    } catch (err: any) {
      console.error("Error loading public profile:", err);
      setError(err.message || "Profile not found");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    try {
      const shareUrl = `https://toledah.com/verified/${orgId}`;
      const message = `Check out ${profile?.organization_name} - ${formatTier(
        profile?.verification_tier || "",
      )} verified on Nova! Trust Score: ${Math.round(
        profile?.overall_score || 0,
      )}/100`;

      await Share.share({
        message: Platform.OS === "ios" ? message : `${message}\n\n${shareUrl}`,
        url: shareUrl,
        title: "Nova Trust Profile",
      });
    } catch (err) {
      console.error("Error sharing:", err);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trust Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>🔍</Text>
          <Text style={styles.errorTitle}>Profile Not Found</Text>
          <Text style={styles.errorText}>
            This business hasn&apos;t been verified on Nova yet.
          </Text>
        </View>
      </View>
    );
  }

  if (!profile.is_verified) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trust Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⏳</Text>
          <Text style={styles.errorTitle}>Not Yet Verified</Text>
          <Text style={styles.errorText}>
            {profile.organization_name} is building their trust score.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trust Profile</Text>
        <TouchableOpacity onPress={handleShare}>
          <Text style={styles.shareButton}>📤</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trust Badge */}
        <TrustBadge profile={profile} />

        {/* Business Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Business Name" value={profile.organization_name} />
            <View style={styles.divider} />
            <InfoRow
              label="Verified Since"
              value={
                profile.verified_at
                  ? new Date(profile.verified_at).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })
                  : "Recently"
              }
            />
            <View style={styles.divider} />
            <InfoRow
              label="Active Days"
              value={`${profile.days_active} days`}
            />
          </View>
        </View>

        {/* What This Means */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What This Means</Text>
          <View style={styles.benefitsCard}>
            <BenefitRow
              icon="✅"
              title="Verified Business"
              description="This business has been verified on Nova with real transaction history."
            />
            <BenefitRow
              icon="📊"
              title="Track Record"
              description={`Over ${profile.total_sales} successful transactions recorded.`}
            />
            <BenefitRow
              icon="🛡️"
              title="Trusted"
              description="High trust score based on payment reliability and customer satisfaction."
            />
          </View>
        </View>

        {/* Trust Score Explanation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trust Score</Text>
          <View style={styles.infoCard}>
            <Text style={styles.explanationText}>
              Nova&apos;s trust score (0-100) is calculated from:
            </Text>
            <View style={styles.criteriaList}>
              <CriteriaItem text="Real-time transaction tracking" />
              <CriteriaItem text="Payment reliability" />
              <CriteriaItem text="Customer relationships" />
              <CriteriaItem text="Business record-keeping" />
              <CriteriaItem text="Time in business" />
            </View>
            <Text style={styles.disclaimer}>
              Trust scores are updated automatically every 30 minutes.
            </Text>
          </View>
        </View>

        {/* Nova Branding */}
        <View style={styles.brandingSection}>
          <Text style={styles.brandingText}>Verified on</Text>
          <Text style={styles.brandingLogo}>Nova</Text>
          <Text style={styles.brandingTagline}></Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Helper function
function formatTier(tier: string): string {
  return tier
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Trust Badge Component
function TrustBadge({ profile }: { profile: PublicTrustProfile }) {
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "nova_verified":
        return "#10b981";
      case "gold":
        return "#f59e0b";
      case "silver":
        return "#6b7280";
      case "bronze":
        return "#f97316";
      default:
        return "#9ca3af";
    }
  };

  const getTierEmoji = (tier: string) => {
    switch (tier) {
      case "nova_verified":
        return "🏆";
      case "gold":
        return "🥇";
      case "silver":
        return "🥈";
      case "bronze":
        return "🥉";
      default:
        return "🎖️";
    }
  };

  const tierColor = getTierColor(profile.verification_tier);

  return (
    <View style={[styles.badge, { backgroundColor: tierColor }]}>
      <Text style={styles.badgeEmoji}>
        {getTierEmoji(profile.verification_tier)}
      </Text>
      <Text style={styles.businessName}>{profile.organization_name}</Text>
      <View style={styles.scoreCircle}>
        <Text style={styles.badgeScore}>
          {Math.round(profile.overall_score)}
        </Text>
        <Text style={styles.badgeScoreLabel}>Trust Score</Text>
      </View>
      <Text style={styles.badgeTier}>
        {formatTier(profile.verification_tier)} Tier
      </Text>
      <View style={styles.verifiedBadge}>
        <Text style={styles.verifiedCheck}>✓</Text>
        <Text style={styles.verifiedText}>Nova Verified</Text>
      </View>
    </View>
  );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// Benefit Row Component
function BenefitRow({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.benefitRow}>
      <Text style={styles.benefitIcon}>{icon}</Text>
      <View style={styles.benefitContent}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDescription}>{description}</Text>
      </View>
    </View>
  );
}

// Criteria Item Component
function CriteriaItem({ text }: { text: string }) {
  return (
    <View style={styles.criteriaItem}>
      <Text style={styles.criteriaBullet}>•</Text>
      <Text style={styles.criteriaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 48,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  shareButton: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },

  // Loading & Error
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.secondary,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.secondary,
    textAlign: "center",
  },

  // Trust Badge
  badge: {
    margin: 16,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  badgeEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  businessName: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 24,
  },
  scoreCircle: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 80,
    width: 160,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 4,
    borderColor: COLORS.white,
  },
  badgeScore: {
    fontSize: 56,
    fontWeight: "bold",
    color: COLORS.white,
  },
  badgeScoreLabel: {
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.9,
    marginTop: 4,
  },
  badgeTier: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 16,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  verifiedCheck: {
    fontSize: 16,
    color: COLORS.white,
    marginRight: 6,
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
  },

  // Sections
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 12,
  },

  // Info Card
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: COLORS.secondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  // Benefits
  benefitsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  benefitIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: COLORS.secondary,
    lineHeight: 20,
  },

  // Explanation
  explanationText: {
    fontSize: 15,
    color: COLORS.primary,
    marginBottom: 12,
  },
  criteriaList: {
    marginBottom: 16,
  },
  criteriaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  criteriaBullet: {
    fontSize: 16,
    color: COLORS.primary,
    marginRight: 8,
    marginTop: 2,
  },
  criteriaText: {
    fontSize: 14,
    color: COLORS.secondary,
    flex: 1,
  },
  disclaimer: {
    fontSize: 12,
    color: COLORS.secondary,
    fontStyle: "italic",
    marginTop: 8,
  },

  // Branding
  brandingSection: {
    alignItems: "center",
    marginTop: 32,
    marginBottom: 16,
  },
  brandingText: {
    fontSize: 12,
    color: COLORS.secondary,
    marginBottom: 4,
  },
  brandingLogo: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  brandingTagline: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
  },
});
