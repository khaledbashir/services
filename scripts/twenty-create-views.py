#!/usr/bin/env python3
"""Twenty CRM Phase 1: Create Views for all team roles per Section 5 of architecture doc."""

import json
import subprocess
import sys
import time

API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODQ3NjQwLCJleHAiOjQ5Mjg0NDc2MzUsImp0aSI6IjdjZWEzNjVkLWI5ODEtNDViZC04MTY1LWRiZjgwOWJjYjQ4YiJ9.rW3KyyKgCVJrQX5WvbYHw62UNX_VkgO5ehLybXTd4bY"
BASE = "https://abc-twenty.izcgmb.easypanel.host/metadata"

# Object Metadata IDs
OBJECTS = {
    'company': 'ccd95b3f-4a9a-443c-b8f2-01bff6c479ab',
    'opportunity': 'c779922d-cf25-4a5e-9382-23eb1c02199e',
    'task': '6e513ef8-368d-4efe-a628-6de4b9de28e4',
    'venue': '136fe14f-02d3-4a6f-bf4a-81abaf6f77f1',
    'technician': '2b49694c-f341-4992-9675-a1f3b8e1e898',
    'venueEvent': '25371460-c4b4-42f8-80f1-78f14a895818',
    'serviceTicket': 'c91ebea2-7dc1-4498-bd54-ebfe89e38c41',
    'service': 'acdef7d4-9be2-4a3e-b671-235f9ee0bbb8',
}

# Key field IDs per object
FIELDS = {
    # Company
    'company.name': '3ef49592-6cd5-43f6-a44a-131f06bd3140',
    'company.serviceStatus': '8a0b66c8-969e-4ee9-9dd9-95d470e57bef',
    'company.contractEnd': '08cee0da-137b-405e-8b26-cd3757ceec1e',
    'company.partnerType': '48a851e0-731e-49fd-b019-ae272d4d7b38',
    'company.annualContractValue': '33711ea5-9479-417a-8cc1-1994033966ed',
    'company.region': '1c9112de-e6cf-4c7c-a31a-b55915faab5f',
    # Opportunity
    'opportunity.name': 'c68ed583-506c-4904-a507-5f140042ef05',
    'opportunity.bidStatus': 'ad436148-604e-4b05-a5a7-9bcc35117410',
    'opportunity.closeDate': '56c90982-6391-4cdf-8b61-9d0097226807',
    'opportunity.amount': 'abe371af-8f95-413f-8e57-eee130a03d3d',
    'opportunity.stage': '09da76a4-8deb-4ea6-a819-42ad92eada4f',
    'opportunity.proposalUrl': '535d47d8-eabb-4683-a03d-ac89d1a7a5ea',
    'opportunity.company': 'fa5178b8-6881-444d-9ed4-8150949129e1',
    # Task
    'task.title': '46436b90-7886-4e5e-a794-28308951a403',
    'task.status': '5b91be33-7828-4ef4-b329-dd5f3222d9da',
    'task.dueAt': '7da7756a-db94-4a1e-9c74-70fc1666fcad',
    'task.assignee': 'd9991cd8-b2e6-4d5f-8eaf-d6f999dcf944',
    'task.taskPriority': '3497609a-c861-4607-bc12-d1b6e5034ed5',
    'task.taskVenue': '16431811-a8c1-494f-b794-9aa65aa95251',
    'task.taskCategory': '24f2e659-3457-455a-b997-665de3e324b0',
    # Venue
    'venue.name': '7640e24e-b2f1-4b7b-ac39-91b66365ddae',
    'venue.venueStatus': '71c2ce8e-0285-4c43-8ae2-b2618ed1c3ef',
    'venue.market': 'e8caf5c4-a467-4903-9690-19166aa58639',
    # VenueEvent
    'venueEvent.name': '7e3f718c-c698-4566-b7ab-b62d9b4114bb',
    'venueEvent.eventDate': '4afbb7fc-a019-43be-8436-cfe19001d785',
    'venueEvent.workflowStatus': 'a412b389-af57-4f03-b071-7aaedb6f6c57',
    'venueEvent.venueName': 'a7977115-399f-4b2c-ae80-cca223e1ccbd',
    # ServiceTicket
    'serviceTicket.name': 'a71801f7-5a5d-4f0e-a130-0af232a58530',
    'serviceTicket.ticketStatus': '98ff775b-1fe8-4093-bef5-56367fcf82b3',
    'serviceTicket.priority': 'c254c7c1-291d-4081-82a8-fd13e4ce615c',
    'serviceTicket.venueName': '52a41d3b-5909-4175-8357-93a597cce2ce',
    'serviceTicket.slaDueDate': 'ffa65f79-a725-458f-b84a-0c0e303eb0bc',
    'serviceTicket.createdAt': '98f3ca4d-e3b5-4365-8a50-9461d0869980',
    # Service
    'service.name': 'c6f46356-9acd-47d1-80dd-b226ac80c8a2',
    'service.serviceStatus': '88ee85f0-b5a4-4b3c-ac1b-4e1a4a23bfe0',
    'service.venue': '0627431d-953a-4a08-8479-863f56add652',
    # Technician
    'technician.name': '8028ae80-5c62-4e3e-a352-c094f9eed6a5',
    'technician.homeVenue': 'e0e6d87a-2067-4e7d-b333-c488ece0f4a1',
}


def gql(query, variables=None):
    """Execute a GraphQL query against the Twenty metadata endpoint."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    result = subprocess.run(
        ['curl', '-s', '-X', 'POST', BASE,
         '-H', f'Authorization: Bearer {API_KEY}',
         '-H', 'Content-Type: application/json',
         '-d', json.dumps(payload)],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)


def create_view(name, object_id, view_type="TABLE", icon="IconTable", position=0, kanban_field=None):
    """Create a view and return its ID."""
    variables = {
        "input": {
            "name": name,
            "objectMetadataId": object_id,
            "type": view_type,
            "icon": icon,
            "position": position,
        }
    }
    if kanban_field:
        variables["input"]["mainGroupByFieldMetadataId"] = kanban_field

    result = gql(
        "mutation($input: CreateViewInput!) { createView(input: $input) { id name } }",
        variables
    )

    if 'errors' in result:
        print(f"  FAIL: {name} - {result['errors'][0].get('message', 'unknown')}")
        return None

    view_id = result.get('data', {}).get('createView', {}).get('id')
    if view_id:
        print(f"  OK: {name} ({view_type}) -> {view_id}")
    else:
        print(f"  FAIL: {name} - unexpected response: {json.dumps(result)[:200]}")
    return view_id


def add_filter(view_id, field_id, operand, value):
    """Add a filter to a view."""
    variables = {
        "input": {
            "viewId": view_id,
            "fieldMetadataId": field_id,
            "operand": operand,
            "value": value,
        }
    }
    result = gql(
        "mutation($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }",
        variables
    )
    if 'errors' in result:
        print(f"    FILTER FAIL: {result['errors'][0].get('message', 'unknown')}")
        return False
    return True


def add_sort(view_id, field_id, direction="ASC"):
    """Add a sort to a view."""
    variables = {
        "input": {
            "viewId": view_id,
            "fieldMetadataId": field_id,
            "direction": direction,
        }
    }
    result = gql(
        "mutation($input: CreateViewSortInput!) { createViewSort(input: $input) { id } }",
        variables
    )
    if 'errors' in result:
        print(f"    SORT FAIL: {result['errors'][0].get('message', 'unknown')}")
        return False
    return True


# ============================================================
print("==========================================")
print("5.1 Leadership — Pipeline & Revenue")
print("==========================================")

# Active Pipeline (Kanban by bidStatus)
vid = create_view("Active Pipeline", OBJECTS['opportunity'], "KANBAN", "IconTargetArrow", 0,
                   FIELDS['opportunity.bidStatus'])
if vid:
    add_filter(vid, FIELDS['opportunity.bidStatus'], "IS_NOT", json.dumps("WON"))
    add_sort(vid, FIELDS['opportunity.closeDate'], "ASC")

# Won This Quarter (Table)
vid = create_view("Won This Quarter", OBJECTS['opportunity'], "TABLE", "IconTrophy", 1)
if vid:
    add_filter(vid, FIELDS['opportunity.bidStatus'], "IS", json.dumps("WON"))
    add_sort(vid, FIELDS['opportunity.amount'], "DESC")

# Expiring Contracts
vid = create_view("Expiring Contracts", OBJECTS['company'], "TABLE", "IconAlertTriangle", 2)
if vid:
    add_filter(vid, FIELDS['company.contractEnd'], "IS_NOT_EMPTY", json.dumps(""))
    add_sort(vid, FIELDS['company.contractEnd'], "ASC")

# Revenue by Region
vid = create_view("Revenue by Region", OBJECTS['company'], "TABLE", "IconMapPin", 3)
if vid:
    add_filter(vid, FIELDS['company.serviceStatus'], "IS_NOT_EMPTY", json.dumps(""))
    add_sort(vid, FIELDS['company.region'], "ASC")

# Account Overview
vid = create_view("Account Overview", OBJECTS['company'], "TABLE", "IconBuilding", 4)
if vid:
    add_filter(vid, FIELDS['company.partnerType'], "IS", json.dumps("CLIENT_OWNER"))
    add_sort(vid, FIELDS['company.annualContractValue'], "DESC")

# ============================================================
print("")
print("==========================================")
print("5.2 Natalia — Proposals & Deals")
print("==========================================")

# My Active Bids (Kanban by bidStatus)
vid = create_view("My Active Bids", OBJECTS['opportunity'], "KANBAN", "IconTargetArrow", 5,
                   FIELDS['opportunity.bidStatus'])
if vid:
    add_sort(vid, FIELDS['opportunity.closeDate'], "ASC")

# Needs Proposal
vid = create_view("Needs Proposal", OBJECTS['opportunity'], "TABLE", "IconFileDescription", 6)
if vid:
    add_filter(vid, FIELDS['opportunity.bidStatus'], "IS", json.dumps("SCOPING"))
    add_filter(vid, FIELDS['opportunity.proposalUrl'], "IS_EMPTY", json.dumps(""))
    add_sort(vid, FIELDS['opportunity.closeDate'], "ASC")

# Lost Deals
vid = create_view("Lost Deals", OBJECTS['opportunity'], "TABLE", "IconX", 7)
if vid:
    add_filter(vid, FIELDS['opportunity.bidStatus'], "IS", json.dumps("LOST"))
    add_sort(vid, FIELDS['opportunity.closeDate'], "DESC")

# ============================================================
print("")
print("==========================================")
print("5.3 Joe / Ops — Venue Operations")
print("==========================================")

# All Venues
vid = create_view("All Venues", OBJECTS['venue'], "TABLE", "IconBuildingStadium", 8)
if vid:
    add_filter(vid, FIELDS['venue.venueStatus'], "IS", json.dumps("ACTIVE"))
    add_sort(vid, FIELDS['venue.name'], "ASC")

# Venues by Market
vid = create_view("Venues by Market", OBJECTS['venue'], "TABLE", "IconMapPin", 9)
if vid:
    add_sort(vid, FIELDS['venue.market'], "ASC")

# Active Services
vid = create_view("Active Services", OBJECTS['service'], "TABLE", "IconTool", 10)
if vid:
    add_filter(vid, FIELDS['service.serviceStatus'], "IS", json.dumps("ACTIVE"))
    add_sort(vid, FIELDS['service.venue'], "ASC")

# Upcoming Events
vid = create_view("Upcoming Events", OBJECTS['venueEvent'], "TABLE", "IconCalendar", 11)
if vid:
    add_filter(vid, FIELDS['venueEvent.workflowStatus'], "IS_NOT", json.dumps("STATUS_CANCELLED"))
    add_sort(vid, FIELDS['venueEvent.eventDate'], "ASC")

# Open Tickets (Kanban by ticketStatus)
vid = create_view("Open Tickets", OBJECTS['serviceTicket'], "KANBAN", "IconTicket", 12,
                   FIELDS['serviceTicket.ticketStatus'])
if vid:
    add_filter(vid, FIELDS['serviceTicket.ticketStatus'], "IS_NOT", json.dumps("STATUS_RESOLVED"))
    add_sort(vid, FIELDS['serviceTicket.priority'], "DESC")

# Staff by Venue
vid = create_view("Staff by Venue", OBJECTS['technician'], "TABLE", "IconUsers", 13)
if vid:
    add_sort(vid, FIELDS['technician.homeVenue'], "ASC")

# ============================================================
print("")
print("==========================================")
print("5.4 Nick & Gianni — Task Board (Wrike Replacement)")
print("==========================================")

# My Tasks (Kanban by status)
vid = create_view("My Tasks", OBJECTS['task'], "KANBAN", "IconCheckbox", 14,
                   FIELDS['task.status'])
if vid:
    add_sort(vid, FIELDS['task.dueAt'], "ASC")

# All Tasks (Kanban by status)
vid = create_view("All Tasks", OBJECTS['task'], "KANBAN", "IconList", 15,
                   FIELDS['task.status'])
if vid:
    add_sort(vid, FIELDS['task.taskPriority'], "DESC")

# Tasks By Venue
vid = create_view("Tasks By Venue", OBJECTS['task'], "TABLE", "IconBuildingStadium", 16)
if vid:
    add_sort(vid, FIELDS['task.taskVenue'], "ASC")

# Tasks By Assignee
vid = create_view("Tasks By Assignee", OBJECTS['task'], "TABLE", "IconUser", 17)
if vid:
    add_sort(vid, FIELDS['task.assignee'], "ASC")

# Overdue Tasks
vid = create_view("Overdue Tasks", OBJECTS['task'], "TABLE", "IconAlertTriangle", 18)
if vid:
    add_filter(vid, FIELDS['task.dueAt'], "IS_IN_PAST", json.dumps(""))
    add_filter(vid, FIELDS['task.status'], "IS_NOT", json.dumps("DONE"))
    add_sort(vid, FIELDS['task.dueAt'], "ASC")

# This Week
vid = create_view("This Week", OBJECTS['task'], "TABLE", "IconCalendar", 19)
if vid:
    add_sort(vid, FIELDS['task.taskPriority'], "DESC")

# Tasks By Category
vid = create_view("Tasks By Category", OBJECTS['task'], "TABLE", "IconTag", 20)
if vid:
    add_sort(vid, FIELDS['task.taskCategory'], "ASC")

# ============================================================
print("")
print("==========================================")
print("5.5 Chris / Support — Tickets")
print("==========================================")

# Ticket Board (Kanban by ticketStatus)
vid = create_view("Ticket Board", OBJECTS['serviceTicket'], "KANBAN", "IconTicket", 21,
                   FIELDS['serviceTicket.ticketStatus'])
if vid:
    add_sort(vid, FIELDS['serviceTicket.priority'], "DESC")

# High Priority Tickets
vid = create_view("High Priority", OBJECTS['serviceTicket'], "TABLE", "IconUrgent", 22)
if vid:
    add_filter(vid, FIELDS['serviceTicket.priority'], "IS", json.dumps("PRI_HIGH"))
    add_filter(vid, FIELDS['serviceTicket.ticketStatus'], "IS_NOT", json.dumps("STATUS_CLOSED"))
    add_sort(vid, FIELDS['serviceTicket.createdAt'], "ASC")

# Tickets By Venue
vid = create_view("Tickets By Venue", OBJECTS['serviceTicket'], "TABLE", "IconBuildingStadium", 23)
if vid:
    add_sort(vid, FIELDS['serviceTicket.venueName'], "ASC")

# SLA At Risk
vid = create_view("SLA At Risk", OBJECTS['serviceTicket'], "TABLE", "IconClock", 24)
if vid:
    add_filter(vid, FIELDS['serviceTicket.ticketStatus'], "IS_NOT", json.dumps("STATUS_RESOLVED"))
    add_filter(vid, FIELDS['serviceTicket.ticketStatus'], "IS_NOT", json.dumps("STATUS_CLOSED"))
    add_filter(vid, FIELDS['serviceTicket.slaDueDate'], "IS_NOT_EMPTY", json.dumps(""))
    add_sort(vid, FIELDS['serviceTicket.slaDueDate'], "ASC")


print("")
print("==========================================")
print("ALL VIEWS CREATED")
print("==========================================")
