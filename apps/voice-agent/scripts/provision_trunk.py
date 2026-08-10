"""One-time SIP trunk + dispatch-rule provisioning against LiveKit.

You need a SIP trunk from a carrier (Telnyx, Twilio Elastic SIP, etc.) and at
least one phone number (DID). This wires that carrier into LiveKit so calls
flow to our agent.

Usage (from apps/voice-agent, with .venv active and LIVEKIT_* + SIP_* env set):

  # Inbound: accept calls the carrier sends to LiveKit, route to our agent
  python -m scripts.provision_trunk inbound --numbers +14155550100

  # Outbound: let us dial out through the carrier (prints the trunk id to put
  # in .env as SIP_OUTBOUND_TRUNK_ID)
  python -m scripts.provision_trunk outbound \
      --address sip.telnyx.com --number +14155550100 \
      --username YOUR_SIP_USER --password YOUR_SIP_PASS

See the carrier setup notes in the repo README (Voice section).
"""

import argparse
import asyncio
import os
import sys

from livekit import api

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import config  # noqa: E402


async def provision_inbound(numbers: list[str]) -> None:
    lk = api.LiveKitAPI(
        url=config.LIVEKIT_URL, api_key=config.LIVEKIT_API_KEY, api_secret=config.LIVEKIT_API_SECRET
    )
    try:
        trunk = await lk.sip.create_sip_inbound_trunk(
            api.CreateSIPInboundTrunkRequest(
                trunk=api.SIPInboundTrunkInfo(
                    name="chatbot-suite-inbound", numbers=numbers
                )
            )
        )
        print(f"Inbound trunk created: {trunk.sip_trunk_id} (numbers: {', '.join(numbers)})")

        # Route every inbound call to a fresh room and dispatch our agent.
        rule = await lk.sip.create_sip_dispatch_rule(
            api.CreateSIPDispatchRuleRequest(
                rule=api.SIPDispatchRule(
                    dispatch_rule_individual=api.SIPDispatchRuleIndividual(room_prefix="voice-in-")
                ),
                room_config=api.RoomConfiguration(
                    agents=[api.RoomAgentDispatch(agent_name="chatbot-suite-voice")]
                ),
            )
        )
        print(f"Dispatch rule created: {rule.sip_dispatch_rule_id}")
        print("\nPoint your carrier's inbound SIP for these numbers at your LiveKit SIP URI.")
    finally:
        await lk.aclose()


async def provision_outbound(address: str, number: str, username: str, password: str) -> None:
    lk = api.LiveKitAPI(
        url=config.LIVEKIT_URL, api_key=config.LIVEKIT_API_KEY, api_secret=config.LIVEKIT_API_SECRET
    )
    try:
        trunk = await lk.sip.create_sip_outbound_trunk(
            api.CreateSIPOutboundTrunkRequest(
                trunk=api.SIPOutboundTrunkInfo(
                    name="chatbot-suite-outbound",
                    address=address,
                    numbers=[number],
                    auth_username=username,
                    auth_password=password,
                )
            )
        )
        print(f"Outbound trunk created: {trunk.sip_trunk_id}")
        print(f"\nAdd this to your .env:\n  SIP_OUTBOUND_TRUNK_ID={trunk.sip_trunk_id}")
    finally:
        await lk.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Provision LiveKit SIP trunks")
    sub = parser.add_subparsers(dest="cmd", required=True)

    pin = sub.add_parser("inbound")
    pin.add_argument("--numbers", nargs="+", required=True, help="DIDs in E.164, e.g. +14155550100")

    pout = sub.add_parser("outbound")
    pout.add_argument("--address", required=True, help="Carrier SIP host, e.g. sip.telnyx.com")
    pout.add_argument("--number", required=True, help="Your caller-ID DID in E.164")
    pout.add_argument("--username", required=True)
    pout.add_argument("--password", required=True)

    args = parser.parse_args()
    if args.cmd == "inbound":
        asyncio.run(provision_inbound(args.numbers))
    else:
        asyncio.run(provision_outbound(args.address, args.number, args.username, args.password))


if __name__ == "__main__":
    main()
