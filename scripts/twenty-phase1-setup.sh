#!/bin/bash
# Twenty CRM Phase 1: Schema Setup
# Creates Service object fields + adds NEW fields to all existing objects

set -e

API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODQ3NjQwLCJleHAiOjQ5Mjg0NDc2MzUsImp0aSI6IjdjZWEzNjVkLWI5ODEtNDViZC04MTY1LWRiZjgwOWJjYjQ4YiJ9.rW3KyyKgCVJrQX5WvbYHw62UNX_VkgO5ehLybXTd4bY"
BASE="https://abc-twenty.izcgmb.easypanel.host/metadata"

# Object Metadata IDs
COMPANY_ID="ccd95b3f-4a9a-443c-b8f2-01bff6c479ab"
PERSON_ID="fb3ffcb0-ba14-4825-9cd6-1f797ebe417a"
OPPORTUNITY_ID="c779922d-cf25-4a5e-9382-23eb1c02199e"
TASK_ID="6e513ef8-368d-4efe-a628-6de4b9de28e4"
VENUE_ID="136fe14f-02d3-4a6f-bf4a-81abaf6f77f1"
TECHNICIAN_ID="2b49694c-f341-4992-9675-a1f3b8e1e898"
VENUE_EVENT_ID="25371460-c4b4-42f8-80f1-78f14a895818"
SERVICE_TICKET_ID="c91ebea2-7dc1-4498-bd54-ebfe89e38c41"
SERVICE_ID="acdef7d4-9be2-4a3e-b671-235f9ee0bbb8"

create_field() {
  local OBJ_ID="$1"
  local NAME="$2"
  local TYPE="$3"
  local LABEL="$4"
  local ICON="$5"
  local EXTRA="$6"  # Additional JSON fields (options, defaultValue, etc.)

  local VARS="{\"input\":{\"type\":\"$TYPE\",\"name\":\"$NAME\",\"label\":\"$LABEL\",\"icon\":\"$ICON\",\"objectMetadataId\":\"$OBJ_ID\",\"isNullable\":true$EXTRA}}"

  RESULT=$(curl -s -X POST "$BASE" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation(\$input: CreateFieldInput!) { createOneField(input: { field: \$input }) { id name type } }\",\"variables\":$VARS}")

  local FIELD_ID=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('createOneField',{}).get('id','FAILED'))" 2>/dev/null)

  if [ "$FIELD_ID" = "FAILED" ]; then
    echo "  FAIL: $NAME on $OBJ_ID"
    echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('    ', d.get('errors',[{}])[0].get('message','unknown error'))" 2>/dev/null
  else
    echo "  OK: $NAME ($TYPE) -> $FIELD_ID"
  fi
}

create_relation() {
  local SOURCE_OBJ_ID="$1"
  local NAME="$2"
  local LABEL="$3"
  local ICON="$4"
  local TARGET_OBJ_ID="$5"
  local REL_TYPE="$6"  # MANY_TO_ONE or ONE_TO_MANY
  local TARGET_FIELD_LABEL="$7"
  local TARGET_FIELD_ICON="$8"
  local TARGET_FIELD_NAME="$9"

  local VARS="{\"input\":{\"type\":\"RELATION\",\"name\":\"$NAME\",\"label\":\"$LABEL\",\"icon\":\"$ICON\",\"objectMetadataId\":\"$SOURCE_OBJ_ID\",\"isNullable\":true,\"relationCreationPayload\":{\"type\":\"$REL_TYPE\",\"targetObjectMetadataId\":\"$TARGET_OBJ_ID\",\"targetFieldLabel\":\"$TARGET_FIELD_LABEL\",\"targetFieldIcon\":\"$TARGET_FIELD_ICON\",\"targetFieldName\":\"$TARGET_FIELD_NAME\"}}}"

  RESULT=$(curl -s -X POST "$BASE" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation(\$input: CreateFieldInput!) { createOneField(input: { field: \$input }) { id name type } }\",\"variables\":$VARS}")

  local FIELD_ID=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('createOneField',{}).get('id','FAILED'))" 2>/dev/null)

  if [ "$FIELD_ID" = "FAILED" ]; then
    echo "  FAIL: $NAME (RELATION) on source $SOURCE_OBJ_ID"
    echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('    ', d.get('errors',[{}])[0].get('message','unknown error'))" 2>/dev/null
  else
    echo "  OK: $NAME (RELATION -> $TARGET_OBJ_ID) -> $FIELD_ID"
  fi
}

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1A: Service Object Fields"
echo "=========================================="

# serviceType (SELECT)
create_field "$SERVICE_ID" "serviceType" "SELECT" "Service Type" "IconCategory" \
  ",\"options\":[{\"value\":\"LED_MAINTENANCE\",\"label\":\"LED Maintenance\",\"position\":0,\"color\":\"green\"},{\"value\":\"CONTENT_MANAGEMENT\",\"label\":\"Content Management\",\"position\":1,\"color\":\"blue\"},{\"value\":\"STAFFING\",\"label\":\"Staffing\",\"position\":2,\"color\":\"orange\"},{\"value\":\"WARRANTY\",\"label\":\"Warranty\",\"position\":3,\"color\":\"gray\"},{\"value\":\"INSTALLATION\",\"label\":\"Installation\",\"position\":4,\"color\":\"purple\"},{\"value\":\"CONSULTING\",\"label\":\"Consulting\",\"position\":5,\"color\":\"yellow\"},{\"value\":\"REMOTE_MONITORING\",\"label\":\"Remote Monitoring\",\"position\":6,\"color\":\"turquoise\"}]"

# serviceStatus (SELECT)
create_field "$SERVICE_ID" "serviceStatus" "SELECT" "Status" "IconCircleCheck" \
  ",\"options\":[{\"value\":\"ACTIVE\",\"label\":\"Active\",\"position\":0,\"color\":\"green\"},{\"value\":\"PAUSED\",\"label\":\"Paused\",\"position\":1,\"color\":\"orange\"},{\"value\":\"EXPIRED\",\"label\":\"Expired\",\"position\":2,\"color\":\"gray\"},{\"value\":\"PENDING\",\"label\":\"Pending\",\"position\":3,\"color\":\"blue\"}]"

# startDate (DATE)
create_field "$SERVICE_ID" "startDate" "DATE" "Start Date" "IconCalendar" ""

# endDate (DATE)
create_field "$SERVICE_ID" "endDate" "DATE" "End Date" "IconCalendarDue" ""

# monthlyValue (CURRENCY)
create_field "$SERVICE_ID" "monthlyValue" "CURRENCY" "Monthly Value" "IconCurrencyDollar" ""

# requiresStaffing (BOOLEAN)
create_field "$SERVICE_ID" "requiresStaffing" "BOOLEAN" "Requires Staffing" "IconUsers" ",\"defaultValue\":false"

# serviceNotes (TEXT)
create_field "$SERVICE_ID" "serviceNotes" "TEXT" "Notes" "IconNotes" ""

# Relations: Service → Venue (MANY_TO_ONE)
create_relation "$SERVICE_ID" "venue" "Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Services" "IconTool" "services"

# Relations: Service → Company (MANY_TO_ONE)
create_relation "$SERVICE_ID" "company" "Company" "IconBuilding" "$COMPANY_ID" "MANY_TO_ONE" "Services" "IconTool" "companyServices"

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1B: Person - New Fields"
echo "=========================================="

# isAncStaff (BOOLEAN)
create_field "$PERSON_ID" "isAncStaff" "BOOLEAN" "Is ANC Staff" "IconUserCheck" ",\"defaultValue\":false"

# slackUserId (TEXT)
create_field "$PERSON_ID" "slackUserId" "TEXT" "Slack User ID" "IconBrandSlack" ""

# decisionRole (SELECT)
create_field "$PERSON_ID" "decisionRole" "SELECT" "Decision Role" "IconUserStar" \
  ",\"options\":[{\"value\":\"ROLE_OWNER\",\"label\":\"Owner\",\"position\":0,\"color\":\"red\"},{\"value\":\"ROLE_AD\",\"label\":\"Athletic Director\",\"position\":1,\"color\":\"blue\"},{\"value\":\"ROLE_VPOPS\",\"label\":\"VP Operations\",\"position\":2,\"color\":\"green\"},{\"value\":\"ROLE_FACILITIES\",\"label\":\"Facilities\",\"position\":3,\"color\":\"orange\"},{\"value\":\"ROLE_AVDIRECTOR\",\"label\":\"AV Director\",\"position\":4,\"color\":\"purple\"},{\"value\":\"ROLE_ESTIMATOR\",\"label\":\"Estimator\",\"position\":5,\"color\":\"gray\"}]"

# department (SELECT)
create_field "$PERSON_ID" "department" "SELECT" "Department" "IconBuildingCommunity" \
  ",\"options\":[{\"value\":\"OPERATIONS\",\"label\":\"Operations\",\"position\":0,\"color\":\"blue\"},{\"value\":\"AV_TECHNOLOGY\",\"label\":\"AV/Technology\",\"position\":1,\"color\":\"green\"},{\"value\":\"FACILITIES\",\"label\":\"Facilities\",\"position\":2,\"color\":\"orange\"},{\"value\":\"EXECUTIVE\",\"label\":\"Executive\",\"position\":3,\"color\":\"red\"},{\"value\":\"FINANCE\",\"label\":\"Finance\",\"position\":4,\"color\":\"yellow\"},{\"value\":\"PROCUREMENT\",\"label\":\"Procurement\",\"position\":5,\"color\":\"gray\"}]"

# preferredContact (SELECT)
create_field "$PERSON_ID" "preferredContact" "SELECT" "Preferred Contact" "IconPhone" \
  ",\"options\":[{\"value\":\"EMAIL\",\"label\":\"Email\",\"position\":0,\"color\":\"blue\"},{\"value\":\"PHONE\",\"label\":\"Phone\",\"position\":1,\"color\":\"green\"},{\"value\":\"SLACK\",\"label\":\"Slack\",\"position\":2,\"color\":\"purple\"},{\"value\":\"TEXT\",\"label\":\"Text\",\"position\":3,\"color\":\"orange\"}]"

# relationshipStrength (SELECT)
create_field "$PERSON_ID" "relationshipStrength" "SELECT" "Relationship Strength" "IconFlame" \
  ",\"options\":[{\"value\":\"COLD\",\"label\":\"Cold\",\"position\":0,\"color\":\"gray\"},{\"value\":\"WARM\",\"label\":\"Warm\",\"position\":1,\"color\":\"orange\"},{\"value\":\"HOT\",\"label\":\"Hot\",\"position\":2,\"color\":\"red\"},{\"value\":\"CHAMPION\",\"label\":\"Champion\",\"position\":3,\"color\":\"green\"}]"

# lastContactDate (DATE)
create_field "$PERSON_ID" "lastContactDate" "DATE" "Last Contact Date" "IconCalendar" ""

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1C: Venue - New Fields"
echo "=========================================="

# venueManagerId (RELATION → Person)
create_relation "$VENUE_ID" "venueManager" "Venue Manager" "IconUserStar" "$PERSON_ID" "MANY_TO_ONE" "Managed Venues" "IconBuildingStadium" "managedVenues"

# leadFieldRepId (RELATION → Person)
create_relation "$VENUE_ID" "leadFieldRep" "Lead Field Rep" "IconUser" "$PERSON_ID" "MANY_TO_ONE" "Lead Rep Venues" "IconBuildingStadium" "leadRepVenues"

# hasContractedServices (BOOLEAN)
create_field "$VENUE_ID" "hasContractedServices" "BOOLEAN" "Contracted Services Active" "IconToggleRight" ",\"defaultValue\":false"

# venueAddress (ADDRESS)
create_field "$VENUE_ID" "venueAddress" "ADDRESS" "Address" "IconMapPin" ""

# timeZone (TEXT)
create_field "$VENUE_ID" "timeZone" "TEXT" "Time Zone" "IconClock" ""

# venueStatus (SELECT)
create_field "$VENUE_ID" "venueStatus" "SELECT" "Status" "IconCircle" \
  ",\"defaultValue\":\"'ACTIVE'\",\"options\":[{\"value\":\"ACTIVE\",\"label\":\"Active\",\"position\":0,\"color\":\"green\"},{\"value\":\"INACTIVE\",\"label\":\"Inactive\",\"position\":1,\"color\":\"orange\"},{\"value\":\"DEACTIVATED\",\"label\":\"Deactivated\",\"position\":2,\"color\":\"red\"}]"

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1D: Opportunity - New Fields"
echo "=========================================="

# rfpSource (SELECT)
create_field "$OPPORTUNITY_ID" "rfpSource" "SELECT" "RFP Source" "IconFileImport" \
  ",\"options\":[{\"value\":\"BUILDING_CONNECTED\",\"label\":\"Building Connected\",\"position\":0,\"color\":\"blue\"},{\"value\":\"DIRECT\",\"label\":\"Direct\",\"position\":1,\"color\":\"green\"},{\"value\":\"REFERRAL\",\"label\":\"Referral\",\"position\":2,\"color\":\"orange\"},{\"value\":\"COLD_OUTREACH\",\"label\":\"Cold Outreach\",\"position\":3,\"color\":\"gray\"}]"

# proposalUrl (TEXT)
create_field "$OPPORTUNITY_ID" "proposalUrl" "TEXT" "Proposal URL" "IconLink" ""

# ledSqFt (NUMBER)
create_field "$OPPORTUNITY_ID" "ledSqFt" "NUMBER" "LED SqFt" "IconRuler" ""

# manufacturer (SELECT)
create_field "$OPPORTUNITY_ID" "manufacturer" "SELECT" "Manufacturer" "IconBuildingFactory" \
  ",\"options\":[{\"value\":\"LG\",\"label\":\"LG\",\"position\":0,\"color\":\"blue\"},{\"value\":\"YAHAM\",\"label\":\"Yaham\",\"position\":1,\"color\":\"green\"},{\"value\":\"ABSEN\",\"label\":\"Absen\",\"position\":2,\"color\":\"red\"},{\"value\":\"DAKTRONICS\",\"label\":\"Daktronics\",\"position\":3,\"color\":\"orange\"},{\"value\":\"SAMSUNG\",\"label\":\"Samsung\",\"position\":4,\"color\":\"purple\"},{\"value\":\"OTHER\",\"label\":\"Other\",\"position\":5,\"color\":\"gray\"}]"

# assignedEstimatorId (RELATION → Person)
create_relation "$OPPORTUNITY_ID" "assignedEstimator" "Assigned Estimator" "IconUser" "$PERSON_ID" "MANY_TO_ONE" "Estimated Opportunities" "IconTargetArrow" "estimatedOpportunities"

# winLossReason (TEXT)
create_field "$OPPORTUNITY_ID" "winLossReason" "TEXT" "Win/Loss Reason" "IconNotes" ""

# venueId (RELATION → Venue)
create_relation "$OPPORTUNITY_ID" "venue" "Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Opportunities" "IconTargetArrow" "opportunities"

# dealSize (SELECT)
create_field "$OPPORTUNITY_ID" "dealSize" "SELECT" "Deal Size" "IconCash" \
  ",\"options\":[{\"value\":\"DEAL_UNDER100K\",\"label\":\"Under 100K\",\"position\":0,\"color\":\"gray\"},{\"value\":\"DEAL_100KTO500K\",\"label\":\"100K-500K\",\"position\":1,\"color\":\"blue\"},{\"value\":\"DEAL_500KTO2M\",\"label\":\"500K-2M\",\"position\":2,\"color\":\"green\"},{\"value\":\"DEAL_OVER2M\",\"label\":\"Over 2M\",\"position\":3,\"color\":\"red\"}]"

# projectType (SELECT)
create_field "$OPPORTUNITY_ID" "projectType" "SELECT" "Project Type" "IconHammer" \
  ",\"options\":[{\"value\":\"NEW_BUILD\",\"label\":\"New Build\",\"position\":0,\"color\":\"green\"},{\"value\":\"RENOVATION\",\"label\":\"Renovation\",\"position\":1,\"color\":\"blue\"},{\"value\":\"EXPANSION\",\"label\":\"Expansion\",\"position\":2,\"color\":\"orange\"},{\"value\":\"REPLACEMENT\",\"label\":\"Replacement\",\"position\":3,\"color\":\"yellow\"},{\"value\":\"SERVICE\",\"label\":\"Service\",\"position\":4,\"color\":\"gray\"}]"

# bidStatus (SELECT)
create_field "$OPPORTUNITY_ID" "bidStatus" "SELECT" "Bid Status" "IconFlag" \
  ",\"options\":[{\"value\":\"RFP_RECEIVED\",\"label\":\"RFP Received\",\"position\":0,\"color\":\"blue\"},{\"value\":\"SCOPING\",\"label\":\"Scoping\",\"position\":1,\"color\":\"orange\"},{\"value\":\"BID_SUBMITTED\",\"label\":\"Bid Submitted\",\"position\":2,\"color\":\"yellow\"},{\"value\":\"SHORTLISTED\",\"label\":\"Shortlisted\",\"position\":3,\"color\":\"green\"},{\"value\":\"WON\",\"label\":\"Won\",\"position\":4,\"color\":\"green\"},{\"value\":\"LOST\",\"label\":\"Lost\",\"position\":5,\"color\":\"red\"},{\"value\":\"NO_BID\",\"label\":\"No Bid\",\"position\":6,\"color\":\"gray\"}]"

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1E: VenueEvent - New Fields"
echo "=========================================="

# venueId (RELATION → Venue)
create_relation "$VENUE_EVENT_ID" "venue" "Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Events" "IconCalendarEvent" "venueEvents"

# eventType (SELECT)
create_field "$VENUE_EVENT_ID" "eventType" "SELECT" "Event Type" "IconCategory" \
  ",\"options\":[{\"value\":\"GAME\",\"label\":\"Game\",\"position\":0,\"color\":\"blue\"},{\"value\":\"CONCERT\",\"label\":\"Concert\",\"position\":1,\"color\":\"purple\"},{\"value\":\"CORPORATE\",\"label\":\"Corporate\",\"position\":2,\"color\":\"orange\"},{\"value\":\"OTHER\",\"label\":\"Other\",\"position\":3,\"color\":\"gray\"}]"

# staffingRequired (BOOLEAN)
create_field "$VENUE_EVENT_ID" "staffingRequired" "BOOLEAN" "Staffing Required" "IconUsers" ",\"defaultValue\":false"

# assignedTechs (TEXT) - if not exists
create_field "$VENUE_EVENT_ID" "assignedTechs" "TEXT" "Assigned Techs" "IconUsers" ""

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1F: ServiceTicket - New Fields"
echo "=========================================="

# venueId (RELATION → Venue)
create_relation "$SERVICE_TICKET_ID" "venue" "Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Tickets" "IconTicket" "serviceTickets"

# reportedById (RELATION → Person)
create_relation "$SERVICE_TICKET_ID" "reportedBy" "Reported By" "IconUser" "$PERSON_ID" "MANY_TO_ONE" "Reported Tickets" "IconTicket" "reportedTickets"

# slaDueDate (DATE)
create_field "$SERVICE_TICKET_ID" "slaDueDate" "DATE" "SLA Due Date" "IconClock" ""

# ticketSource (SELECT)
create_field "$SERVICE_TICKET_ID" "ticketSource" "SELECT" "Source" "IconDevices" \
  ",\"options\":[{\"value\":\"DASHBOARD\",\"label\":\"Dashboard\",\"position\":0,\"color\":\"blue\"},{\"value\":\"EMAIL\",\"label\":\"Email\",\"position\":1,\"color\":\"green\"},{\"value\":\"SLACK\",\"label\":\"Slack\",\"position\":2,\"color\":\"purple\"},{\"value\":\"AI_DETECTED\",\"label\":\"AI Detected\",\"position\":3,\"color\":\"orange\"},{\"value\":\"PHONE\",\"label\":\"Phone\",\"position\":4,\"color\":\"gray\"}]"

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1G: Task - New Fields"
echo "=========================================="

# taskType (SELECT)
create_field "$TASK_ID" "taskType" "SELECT" "Task Type" "IconCategory" \
  ",\"options\":[{\"value\":\"PROJECT\",\"label\":\"Project\",\"position\":0,\"color\":\"blue\"},{\"value\":\"MAINTENANCE\",\"label\":\"Maintenance\",\"position\":1,\"color\":\"green\"},{\"value\":\"FOLLOW_UP\",\"label\":\"Follow Up\",\"position\":2,\"color\":\"orange\"},{\"value\":\"ADMINISTRATIVE\",\"label\":\"Administrative\",\"position\":3,\"color\":\"gray\"},{\"value\":\"INSTALLATION\",\"label\":\"Installation\",\"position\":4,\"color\":\"purple\"},{\"value\":\"INSPECTION\",\"label\":\"Inspection\",\"position\":5,\"color\":\"yellow\"}]"

# taskPriority (SELECT)
create_field "$TASK_ID" "taskPriority" "SELECT" "Priority" "IconUrgent" \
  ",\"options\":[{\"value\":\"URGENT\",\"label\":\"Urgent\",\"position\":0,\"color\":\"red\"},{\"value\":\"HIGH\",\"label\":\"High\",\"position\":1,\"color\":\"orange\"},{\"value\":\"MEDIUM\",\"label\":\"Medium\",\"position\":2,\"color\":\"yellow\"},{\"value\":\"LOW\",\"label\":\"Low\",\"position\":3,\"color\":\"gray\"}]"

# taskVenueId (RELATION → Venue)
create_relation "$TASK_ID" "taskVenue" "Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Tasks" "IconCheckbox" "venueTasks"

# taskCategory (SELECT)
create_field "$TASK_ID" "taskCategory" "SELECT" "Category" "IconTag" \
  ",\"options\":[{\"value\":\"HARDWARE\",\"label\":\"Hardware\",\"position\":0,\"color\":\"blue\"},{\"value\":\"SOFTWARE\",\"label\":\"Software\",\"position\":1,\"color\":\"green\"},{\"value\":\"CONTENT\",\"label\":\"Content\",\"position\":2,\"color\":\"purple\"},{\"value\":\"STAFFING\",\"label\":\"Staffing\",\"position\":3,\"color\":\"orange\"},{\"value\":\"LOGISTICS\",\"label\":\"Logistics\",\"position\":4,\"color\":\"yellow\"},{\"value\":\"ADMIN\",\"label\":\"Admin\",\"position\":5,\"color\":\"gray\"},{\"value\":\"SALES\",\"label\":\"Sales\",\"position\":6,\"color\":\"red\"}]"

# startDate (DATE)
create_field "$TASK_ID" "startDate" "DATE" "Start Date" "IconCalendar" ""

# estimatedHours (NUMBER)
create_field "$TASK_ID" "estimatedHours" "NUMBER" "Estimated Hours" "IconClock" ""

# actualHours (NUMBER)
create_field "$TASK_ID" "actualHours" "NUMBER" "Actual Hours" "IconClockCheck" ""

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1H: Technician - New Fields"
echo "=========================================="

# homeVenueId (RELATION → Venue)
create_relation "$TECHNICIAN_ID" "homeVenue" "Home Venue" "IconBuildingStadium" "$VENUE_ID" "MANY_TO_ONE" "Staff" "IconUsers" "homeStaff"

# techRegion (SELECT)
create_field "$TECHNICIAN_ID" "techRegion" "SELECT" "Region" "IconMapPin" \
  ",\"options\":[{\"value\":\"NORTHEAST\",\"label\":\"Northeast\",\"position\":0,\"color\":\"blue\"},{\"value\":\"SOUTHEAST\",\"label\":\"Southeast\",\"position\":1,\"color\":\"green\"},{\"value\":\"MIDWEST\",\"label\":\"Midwest\",\"position\":2,\"color\":\"orange\"},{\"value\":\"SOUTHWEST\",\"label\":\"Southwest\",\"position\":3,\"color\":\"red\"},{\"value\":\"WEST\",\"label\":\"West\",\"position\":4,\"color\":\"purple\"}]"

# availabilityStatus (SELECT)
create_field "$TECHNICIAN_ID" "availabilityStatus" "SELECT" "Availability" "IconCircle" \
  ",\"defaultValue\":\"'AVAILABLE'\",\"options\":[{\"value\":\"AVAILABLE\",\"label\":\"Available\",\"position\":0,\"color\":\"green\"},{\"value\":\"ASSIGNED\",\"label\":\"Assigned\",\"position\":1,\"color\":\"blue\"},{\"value\":\"UNAVAILABLE\",\"label\":\"Unavailable\",\"position\":2,\"color\":\"red\"},{\"value\":\"ON_LEAVE\",\"label\":\"On Leave\",\"position\":3,\"color\":\"gray\"}]"

# certifications (TEXT)
create_field "$TECHNICIAN_ID" "certifications" "TEXT" "Certifications" "IconCertificate" ""

# ============================================================
echo ""
echo "=========================================="
echo "PHASE 1I: Company - New Fields"
echo "=========================================="

# accountOwnerId already exists as built-in relation, skip
echo "  SKIP: accountOwnerId - already exists as built-in relation"

echo ""
echo "=========================================="
echo "ALL DONE - Phase 1 Schema Setup Complete"
echo "=========================================="
