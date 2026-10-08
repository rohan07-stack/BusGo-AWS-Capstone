
import json
import os
import uuid
import base64
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

# DynamoDB configuration
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("BOOKINGS_TABLE", "BusBookings")
table = dynamodb.Table(TABLE_NAME)

# Demo bus data
BUSES = [
    {
        "busId": "BUS001",
        "operator": "Express Travels",
        "from": "Pune",
        "to": "Mumbai",
        "departure": "10:30 PM",
        "arrival": "05:30 AM",
        "type": "AC Sleeper",
        "fare": 850,
        "seatsAvailable": 18
    },
    {
        "busId": "BUS002",
        "operator": "Maharashtra Express",
        "from": "Pune",
        "to": "Nashik",
        "departure": "07:00 AM",
        "arrival": "01:00 PM",
        "type": "AC Seater",
        "fare": 650,
        "seatsAvailable": 27
    },
    {
        "busId": "BUS003",
        "operator": "Shivneri Travels",
        "from": "Pune",
        "to": "Mumbai",
        "departure": "09:00 AM",
        "arrival": "02:30 PM",
        "type": "Volvo AC",
        "fare": 950,
        "seatsAvailable": 12
    }
]


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        },
        "body": json.dumps(body)
    }


def get_http_method(event):
    """Support REST API and HTTP API payload formats."""
    return (
        event.get("httpMethod")
        or event.get("requestContext", {})
             .get("http", {})
             .get("method")
        or "GET"
    ).upper()


def lambda_handler(event, context):
    method = get_http_method(event)

    # CORS preflight
    if method == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    # List and filter buses
    if method == "GET":
        params = event.get("queryStringParameters") or {}
        source = params.get("from", "").strip().lower()
        destination = params.get("to", "").strip().lower()

        results = [
            bus for bus in BUSES
            if (not source or bus["from"].lower() == source)
            and (
                not destination
                or bus["to"].lower() == destination
            )
        ]

        return response(200, {"buses": results})

    # Create booking
    if method == "POST":
        try:
            body = event.get("body") or "{}"

            if event.get("isBase64Encoded"):
                body = base64.b64decode(body).decode("utf-8")

            data = json.loads(body)

            if not isinstance(data, dict):
                return response(400, {
                    "message": "Request body must be a JSON object"
                })

            required = ["busId", "passengerName", "travelDate"]

            if any(
                not str(data.get(key, "")).strip()
                for key in required
            ):
                return response(400, {
                    "message": (
                        "busId, passengerName, and travelDate "
                        "are required"
                    )
                })

            bus_id = str(data["busId"]).strip()

            bus = next(
                (item for item in BUSES if item["busId"] == bus_id),
                None
            )

            if bus is None:
                return response(400, {"message": "Invalid busId"})

            booking_id = str(uuid.uuid4())

            booking = {
                "bookingId": booking_id,
                "busId": bus["busId"],
                "passengerName": str(
                    data["passengerName"]
                ).strip(),
                "travelDate": str(data["travelDate"]).strip(),
                "source": bus["from"],
                "destination": bus["to"],
                "fare": bus["fare"],
                "status": "CONFIRMED",
                "createdAt": datetime.now(timezone.utc).isoformat()
            }

            # Save booking to DynamoDB
            table.put_item(Item=booking)

            # Return ID both at top level and inside booking
            return response(201, {
                "message": "Booking created successfully",
                "bookingId": booking_id,
                "booking": booking
            })

        except (json.JSONDecodeError, TypeError, ValueError):
            return response(400, {
                "message": "Invalid JSON request"
            })

        except ClientError as error:
            print("DynamoDB error:", error.response.get(
                "Error", {}
            ).get("Code", "UnknownError"))

            return response(500, {
                "message": "Could not save booking"
            })

        except Exception:
            print("Unexpected error while processing booking")
            raise

    return response(405, {"message": "Method not allowed"})