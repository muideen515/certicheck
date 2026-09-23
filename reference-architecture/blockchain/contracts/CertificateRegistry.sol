// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    struct Certificate {
        string certificateId;
        address issuer;
        address recipient;
        string metadataHash;
        uint256 createdAt;
        bool active;
    }

    mapping(string => Certificate) public certificates;
    mapping(address => bool) public authorizedIssuers;

    event CertificateMinted(
        string indexed certificateId,
        address indexed issuer,
        address indexed recipient,
        string metadataHash,
        uint256 createdAt
    );

    event IssuerAuthorized(address indexed issuer, bool authorized);

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], 'Not authorized issuer');
        _;
    }

    function setIssuerAuthorization(address issuer, bool authorized) external {
        authorizedIssuers[issuer] = authorized;
        emit IssuerAuthorized(issuer, authorized);
    }

    function mintCertificate(
        string memory certificateId,
        address recipient,
        string memory metadataHash
    ) external onlyAuthorizedIssuer {
        require(bytes(certificates[certificateId].certificateId).length == 0, 'Certificate already exists');

        certificates[certificateId] = Certificate({
            certificateId: certificateId,
            issuer: msg.sender,
            recipient: recipient,
            metadataHash: metadataHash,
            createdAt: block.timestamp,
            active: true
        });

        emit CertificateMinted(certificateId, msg.sender, recipient, metadataHash, block.timestamp);
    }

    function getCertificate(string memory certificateId)
        external
        view
        returns (Certificate memory)
    {
        return certificates[certificateId];
    }
}
