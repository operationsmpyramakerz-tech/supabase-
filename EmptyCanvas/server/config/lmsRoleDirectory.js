"use strict";

/**
 * Canonical LMS role directory metadata shared by page and API routes.
 * Keeping this outside app.js prevents UI routing details from being mixed
 * with role-specific data-access logic.
 */
module.exports = Object.freeze({
  supervisors: {
    table: "lms_supervisors",
    label: "Supervisor",
    plural: "Supervisors",
    icon: "shield",
  },
  "team-leaders": {
    table: "lms_team_leaders",
    label: "Team Leader",
    plural: "Team Leaders",
    icon: "award",
  },
  instructors: {
    table: "lms_instructors",
    label: "Instructor",
    plural: "Instructors",
    icon: "user",
  },
  "co-instructors": {
    table: "lms_co_instructors",
    label: "Co-Instructor",
    plural: "Co-Instructors",
    icon: "users",
  },
  "school-coordinators": {
    table: "lms_school_coordinators",
    label: "School Coordinator",
    plural: "School Coordinators",
    icon: "clipboard",
  },
  students: {
    table: "lms_students",
    label: "Student",
    plural: "Students",
    icon: "book-open",
  },
  parents: {
    table: "lms_parents",
    label: "Parent",
    plural: "Parents",
    icon: "heart",
  },
});
