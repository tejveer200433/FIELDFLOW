package com.fieldflow.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingRulesTest {
    @Test public void rejectsCredentialLeakDestinations() {
        for (String input : new String[]{"http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com?token=secret", "https://example.com#fragment", "file:///tmp"}) {
            assertThrows(IllegalArgumentException.class, () -> TrackingRules.httpsOrigin(input));
        }
        assertEquals("https://example.com", TrackingRules.httpsOrigin(" https://example.com/ "));
    }
    @Test public void staleOrRolledBackPolicyPausesCollection() {
        assertFalse(TrackingRules.policyFresh(0, 100));
        assertFalse(TrackingRules.policyFresh(1000, 999));
        assertTrue(TrackingRules.policyFresh(1000, 121000));
        assertFalse(TrackingRules.policyFresh(1000, 121001));
    }
    @Test public void protectsExcludedAppNamesAndPackageIds() {
        assertTrue(TrackingRules.excluded("com.whatsapp", "WhatsApp", "whatsapp"));
        assertTrue(TrackingRules.excluded("com.whatsapp", "WhatsApp", " COM.WHATSAPP "));
        assertFalse(TrackingRules.excluded("com.whatsapp.w4b", "WhatsApp Business", "com.whatsapp"));
    }
    @Test public void rejectsStaleAndInvalidLocations() {
        assertTrue(TrackingRules.validFix(0, 0, 100));
        assertFalse(TrackingRules.validFix(Double.NaN, 70, 100));
        assertFalse(TrackingRules.validFix(91, 70, 100));
        assertFalse(TrackingRules.validFix(20, 181, 100));
        assertFalse(TrackingRules.validFix(20, 70, 90001));
        assertFalse(TrackingRules.validFix(20, 70, -1));
    }
    @Test public void boundsCaptureAndSamplingIntervals() {
        assertEquals(180, TrackingRules.interval(-1, 180, 300));
        assertEquals(300, TrackingRules.interval(10000, 180, 300));
        assertEquals(240, TrackingRules.interval(240, 180, 300));
    }
    @Test public void requestsCannotCrossAccountsSessionsOrExpiry() {
        assertTrue(TrackingRules.requestApplies("a", "a", "s", "s", 2000, 1000));
        assertFalse(TrackingRules.requestApplies("a", "b", "s", "s", 2000, 1000));
        assertFalse(TrackingRules.requestApplies("a", "a", "old", "new", 2000, 1000));
        assertFalse(TrackingRules.requestApplies("a", "a", "s", "s", 1000, 1000));
        assertFalse(TrackingRules.requestApplies("", "", "s", "s", 2000, 1000));
    }
}
