import type { Issue, ReturnableIssue } from '@assetdesk/contracts';

import { formatIstDateTime } from '../../lib/date-time';

type BillIssue = Issue | ReturnableIssue;

function totalIssued(issue: BillIssue): number {
  return 'totalIssuedQuantity' in issue
    ? issue.totalIssuedQuantity
    : issue.lines.reduce((sum, line) => sum + line.issuedQuantity, 0);
}

function optional(value: string | null | undefined): string {
  return value?.trim() ? value : 'Not provided';
}

function issuePurpose(issue: BillIssue): string {
  return 'purpose' in issue ? optional(issue.purpose) : 'Not available in this view';
}

function issueNotes(issue: BillIssue): string {
  return 'notes' in issue ? optional(issue.notes) : 'Not available in this view';
}

function generatedAt(): string {
  return formatIstDateTime(new Date());
}

export function BillDocument({ issue }: { issue: BillIssue }) {
  return (
    <article className="bill-sheet" aria-label={`Bill for ${issue.issueId}`}>
      <header className="bill-header">
        <div>
          <p className="bill-kicker">AssetDesk University Material Issue Bill</p>
          <h1>Material Issue Bill</h1>
          <p className="bill-muted">Official issue record for university material handover.</p>
        </div>
        <div className="bill-id-box">
          <span>Bill / Issue No.</span>
          <strong>{issue.issueId}</strong>
        </div>
      </header>

      <section className="bill-grid bill-summary-grid">
        <BillField label="Issue ID" value={issue.issueId} />
        <BillField label="Issue status" value={issue.status.replaceAll('_', ' ')} />
        <BillField label="Assignment type" value={issue.assignmentType.replaceAll('_', ' ')} />
        <BillField label="Issued at" value={formatIstDateTime(issue.issuedAt)} />
        <BillField
          label="Expected return"
          value={issue.expectedReturnAt ? formatIstDateTime(issue.expectedReturnAt) : 'No fixed return'}
        />
        <BillField label="Generated at" value={generatedAt()} />
      </section>

      <section className="bill-two-column">
        <div>
          <h2>Receiver Details</h2>
          <dl className="bill-detail-list">
            <BillRow label="Name" value={issue.receiver.fullName} />
            <BillRow label="Receiver code" value={issue.receiver.receiverCode} />
            <BillRow label="University ID" value={optional(issue.receiver.universityId)} />
            <BillRow label="Type" value={issue.receiver.type.replaceAll('_', ' ')} />
            <BillRow label="Department" value={optional(issue.receiver.department)} />
            <BillRow label="Contact" value={issue.receiver.contact} />
            <BillRow label="Email" value={issue.receiver.email} />
          </dl>
        </div>
        <div>
          <h2>Issued By</h2>
          <dl className="bill-detail-list">
            <BillRow label="Name" value={issue.issuedBy.name} />
            <BillRow label="Worker ID" value={issue.issuedBy.workerId} />
            <BillRow label="Role" value={issue.issuedBy.role} />
            <BillRow label="Purpose" value={issuePurpose(issue)} />
            <BillRow label="Notes" value={issueNotes(issue)} />
          </dl>
        </div>
      </section>

      <section>
        <h2>Issued Material Details</h2>
        <div className="bill-table-wrap">
          <table className="bill-table">
            <thead>
              <tr>
                <th scope="col">S.No.</th>
                <th scope="col">Material</th>
                <th scope="col">Code</th>
                <th scope="col">Category</th>
                <th scope="col">Tracking</th>
                <th scope="col">Policy</th>
                <th scope="col">Issued</th>
                <th scope="col">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {issue.lines.map((line, index) => (
                <tr key={line.lineId}>
                  <td>{index + 1}</td>
                  <td>{line.material.name}</td>
                  <td>{line.material.materialCode}</td>
                  <td>{line.material.category}</td>
                  <td>{line.material.trackingMode.replaceAll('_', ' ')}</td>
                  <td>{line.material.returnPolicy}</td>
                  <td>
                    {line.issuedQuantity} {line.material.unitLabel ?? 'unit'}
                  </td>
                  <td>
                    {line.outstandingQuantity} {line.material.unitLabel ?? 'unit'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Total</td>
                <td>{totalIssued(issue)}</td>
                <td>{issue.totalOutstandingQuantity}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {issue.lines.some((line) => line.assets.length > 0) ? (
        <section>
          <h2>Serialized Asset Details</h2>
          <div className="bill-table-wrap">
            <table className="bill-table">
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col">Asset tag</th>
                  <th scope="col">Serial number</th>
                  <th scope="col">Condition at issue</th>
                  <th scope="col">Current state</th>
                </tr>
              </thead>
              <tbody>
                {issue.lines.flatMap((line) =>
                  line.assets.map((asset) => (
                    <tr key={`${line.lineId}-${asset.assetTag}`}>
                      <td>{line.material.name}</td>
                      <td>{asset.assetTag}</td>
                      <td>{optional(asset.serialNumber)}</td>
                      <td>{asset.conditionAtIssue}</td>
                      <td>
                        {asset.outstanding
                          ? 'ISSUED'
                          : `${asset.returnDisposition ?? 'RETURNED'} at ${formatIstDateTime(
                              asset.returnedAt,
                            )}`}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="bill-two-column bill-signatures">
        <div>
          <span>Receiver signature</span>
        </div>
        <div>
          <span>Issuer / Store in-charge signature</span>
        </div>
      </section>

      <footer className="bill-footer">
        <p>
          This bill confirms that the listed material was issued to the receiver above. Reusable
          material must be returned in acceptable condition by the expected return date where
          applicable.
        </p>
      </footer>
    </article>
  );
}

function BillField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bill-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
