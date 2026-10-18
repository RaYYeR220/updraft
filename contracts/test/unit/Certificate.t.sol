// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {LaunchCertificate, Certificate} from "../../src/LaunchCertificate.sol";

contract CertificateTest is Test {
    LaunchCertificate internal cert;
    mapping(address => bool) public isRound;
    address internal round = makeAddr("round");

    function setUp() public {
        cert = new LaunchCertificate(address(this));
        cert.setFactory(address(this));
        isRound[round] = true;
    }

    function _cert(address token) internal view returns (Certificate memory c) {
        c.round = round;
        c.token = token;
        c.poolId = keccak256("pool");
        c.firedAt = uint40(block.timestamp);
        c.quoteUsed = 1_000e6;
        c.tokensOut = 123e18;
        c.participants = 42;
        c.top1Bps = 900;
        c.top10Bps = 4100;
    }

    function test_record_onlyRound() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(LaunchCertificate.NotRound.selector);
        cert.record(_cert(address(0x70)));
    }

    function test_record_roundMustBeCaller() public {
        Certificate memory c = _cert(address(0x70));
        c.round = makeAddr("other");
        vm.prank(round);
        vm.expectRevert(LaunchCertificate.NotRound.selector);
        cert.record(c);
    }

    function test_record_once() public {
        vm.startPrank(round);
        cert.record(_cert(address(0x70)));
        vm.expectRevert(LaunchCertificate.AlreadyRecorded.selector);
        cert.record(_cert(address(0x70)));
        vm.stopPrank();
    }

    function test_get_roundTrips() public {
        vm.prank(round);
        cert.record(_cert(address(0x70)));
        Certificate memory c = cert.get(address(0x70));
        assertTrue(cert.exists(address(0x70)));
        assertEq(c.participants, 42);
        assertEq(c.top10Bps, 4100);
        assertEq(c.tokensOut, 123e18);
        assertFalse(cert.exists(address(0x71)));
    }

    function test_setFactory_once() public {
        vm.expectRevert(LaunchCertificate.FactoryAlreadySet.selector);
        cert.setFactory(address(1));
    }
}
