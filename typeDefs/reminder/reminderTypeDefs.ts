import { ReminderAction } from '../../constants/reminder';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const reminderTypeDefs = `
  ${gqlEnum('ReminderAction', ReminderAction)}

  # When one reminder goes off: never (off), or a number of days before. Days left out (null)
  # follow the account's usual timing.
  type ReminderTiming {
    off: Boolean!
    days: Int
  }

  input ReminderTimingInput {
    off: Boolean!
    days: Int
  }

  # When reminders go off for anything without its own timing
  type ReminderSettings {
    # Days before a payment is due: 0, 1, 3 or 7
    paymentDays: Int!
    # Days before a renewal: 7, 14 or 30
    renewalDays: Int!
    # Whether payday has a reminder
    payday: Boolean!
  }

  # What the user did with one reminder. The app works the reminders out from the payments, notes
  # and payday; only this is kept, so it follows the user between devices.
  type ReminderState {
    # What it's about and the date it's for, e.g. "due:<payment id>:2026-10-09"
    key: String!
    # Seen, so it no longer counts towards the bell's number
    read: Boolean!
    # Put away for good
    cleared: Boolean!
    # Put away until this day, when it goes off again
    snoozedUntil: String
  }

  # A private address a calendar app checks for the account's dates: /cal/<token>.ics
  type CalendarFeed {
    # The secret in the address; null while the feed is off
    token: String
    payments: Boolean!
    paydays: Boolean!
    renewals: Boolean!
    notes: Boolean!
    debtFree: Boolean!
    # Amounts in event titles
    showAmounts: Boolean!
  }

  extend type Account {
    reminderSettings: ReminderSettings!
    reminderStates: [ReminderState!]!
    calendarFeed: CalendarFeed!
  }

  # Whatever is left out stays as it is
  input UpdateReminderSettingsInput {
    accountId: ID!
    paymentDays: Int
    renewalDays: Int
    payday: Boolean
  }

  input UpdateRemindersInput {
    accountId: ID!
    keys: [String!]!
    action: ReminderAction!
    # For LATER: the day it comes back, YYYY-MM-DD, after today and within a year
    until: String
  }

  # Whatever is left out stays as it is
  input UpdateCalendarFeedInput {
    accountId: ID!
    # Turning it on gives it an address; turning it off stops the address working
    enabled: Boolean
    payments: Boolean
    paydays: Boolean
    renewals: Boolean
    notes: Boolean
    debtFree: Boolean
    showAmounts: Boolean
  }

  type ReminderStatesResponse {
    # The reminders' states after the change
    states: [ReminderState!]!
    success: Boolean!
  }

  type Mutation {
    updateReminderSettings(input: UpdateReminderSettingsInput!): AccountResponse!
    # Marks reminders read, clears them, puts them away until a day, or brings them back
    updateReminders(input: UpdateRemindersInput!): ReminderStatesResponse!
    updateCalendarFeed(input: UpdateCalendarFeedInput!): AccountResponse!
    # A new address for the feed; the old one stops working
    resetCalendarFeed(accountId: ID!): AccountResponse!
  }
`;
