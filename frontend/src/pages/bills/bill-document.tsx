import type { Issue, ReturnEvent, ReturnableIssue } from '@assetdesk/contracts';

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

export function BillDocument({
  issue,
  returnEvent = null,
}: {
  issue: BillIssue;
  returnEvent?: ReturnEvent | null;
}) {
  if (returnEvent) return <ReturnBillDocument issue={issue} returnEvent={returnEvent} />;

  return (
    <article className="bill-sheet" aria-label={`Issue/return receipt for ${issue.issueId}`}>
      <ReceiptHeader
        documentLabel="IT ASSET ISSUE RECEIPT"
        documentNumberLabel="Receipt / Issue No."
        documentNumber={issue.issueId}
        note="Graphic Era Deemed to be University"
      />

      <section className="bill-grid bill-summary-grid">
        <BillField label="Issue ID" value={issue.issueId} />
        <BillField label="Issue status" value={issue.status.replaceAll('_', ' ')} />
        <BillField
          label="Material type"
          value={[
            ...new Set(
              issue.lines.map((line) =>
                line.material.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable',
              ),
            ),
          ].join(' + ')}
        />
        <BillField label="Issued at" value={formatIstDateTime(issue.issuedAt)} />
        <BillField
          label="Expected return"
          value={
            issue.expectedReturnAt ? formatIstDateTime(issue.expectedReturnAt) : 'No fixed return'
          }
        />
        <BillField label="Generated at" value={generatedAt()} />
        <BillField
          label="Issue duration"
          value={issue.assignmentType === 'LONG_TERM' ? 'Permanent issue' : 'Return by date'}
        />
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
                <th scope="col">Material type</th>
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
                  <td>
                    {line.material.trackingMode === 'SERIALIZED' ? 'IT Asset' : 'IT Consumable'}
                  </td>
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
          <h2>IT Asset Serial Details</h2>
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
          <span>I/C Computer Centre</span>
        </div>
      </section>

      <footer className="bill-footer">
        <p>
          This receipt confirms that the listed material was issued to the receiver above.
          Returnable material must be returned in acceptable condition by the expected return date
          where applicable.
        </p>
      </footer>
    </article>
  );
}

function ReturnBillDocument({
  issue,
  returnEvent,
}: {
  issue: BillIssue;
  returnEvent: ReturnEvent;
}) {
  return (
    <article className="bill-sheet" aria-label={`Return receipt for ${issue.issueId}`}>
      <ReceiptHeader
        documentLabel="IT ASSET RETURN RECEIPT"
        documentNumberLabel="Receipt / Issue No."
        documentNumber={issue.issueId}
        note="Graphic Era Deemed to be University"
      />

      <section className="bill-grid bill-summary-grid">
        <BillField label="Issue ID" value={issue.issueId} />
        <BillField label="Return event" value={returnEvent.returnEventId} />
        <BillField
          label="Return status"
          value={returnEvent.resultingIssueStatus.replaceAll('_', ' ')}
        />
        <BillField label="Returned at" value={formatIstDateTime(returnEvent.returnedAt)} />
        <BillField label="Returned units" value={String(returnedTotal(returnEvent))} />
        <BillField
          label="Remaining outstanding"
          value={String(returnEvent.remainingOutstandingQuantity)}
        />
      </section>

      <section className="bill-two-column">
        <div>
          <h2>Receiver Details</h2>
          <dl className="bill-detail-list">
            <BillRow label="Name" value={issue.receiver.fullName} />
            <BillRow label="Receiver code" value={issue.receiver.receiverCode} />
            <BillRow label="University ID" value={optional(issue.receiver.universityId)} />
            <BillRow label="Department" value={optional(issue.receiver.department)} />
            <BillRow label="Email" value={issue.receiver.email} />
          </dl>
        </div>
        <div>
          <h2>Return Recorded By</h2>
          <dl className="bill-detail-list">
            <BillRow label="Name" value={returnEvent.performedBy.name} />
            <BillRow label="Worker ID" value={returnEvent.performedBy.workerId} />
            <BillRow label="Role" value={returnEvent.performedBy.role} />
            <BillRow label="Notes" value={optional(returnEvent.notes)} />
          </dl>
        </div>
      </section>

      <section>
        <h2>Returned Material Details</h2>
        <div className="bill-table-wrap">
          <table className="bill-table">
            <thead>
              <tr>
                <th scope="col">S.No.</th>
                <th scope="col">Material</th>
                <th scope="col">Code</th>
                <th scope="col">Returned</th>
                <th scope="col">Asset / serial</th>
                <th scope="col">Disposition</th>
                <th scope="col">Condition</th>
              </tr>
            </thead>
            <tbody>
              {returnEvent.items.map((item, index) => (
                <tr key={`${returnEvent.returnEventId}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.materialName}</td>
                  <td>{item.materialCode}</td>
                  <td>{item.trackingMode === 'QUANTITY' ? item.quantity : 1}</td>
                  <td>
                    {item.trackingMode === 'SERIALIZED'
                      ? `${item.assetTag}${item.serialNumber ? ` / ${item.serialNumber}` : ''}`
                      : 'Quantity return'}
                  </td>
                  <td>{item.disposition}</td>
                  <td>{item.condition}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total returned</td>
                <td>{returnedTotal(returnEvent)}</td>
                <td colSpan={3}>
                  Remaining outstanding: {returnEvent.remainingOutstandingQuantity}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="bill-two-column bill-signatures">
        <div>
          <span>Receiver / Returner signature</span>
        </div>
        <div>
          <span>I/C Computer Centre</span>
        </div>
      </section>

      <footer className="bill-footer">
        <p>
          This receipt confirms that the listed material was returned and recorded in AssetDesk.
          Damaged, lost or repair outcomes remain visible in the Issue Record history.
        </p>
      </footer>
    </article>
  );
}

function returnedTotal(event: ReturnEvent): number {
  return event.items.reduce(
    (total, item) => total + (item.trackingMode === 'QUANTITY' ? item.quantity : 1),
    0,
  );
}

function ReceiptHeader({
  documentLabel,
  documentNumberLabel,
  documentNumber,
  note,
}: {
  documentLabel: string;
  documentNumberLabel: string;
  documentNumber: string;
  note: string;
}) {
  return (
    <header className="bill-header">
      <div className="bill-brand-block">
        <img alt="AssetDesk logo" className="bill-logo" src="/logo.webp" />
        <div className="bill-brand-text">
          <p className="bill-brand-name">AssetDesk</p>
          <p className="bill-brand-tagline">Graphic Era Deemed to be University</p>
        </div>
      </div>
      <div className="bill-title-block">
        <h1>{documentLabel}</h1>
        <p className="bill-muted">{note}</p>
      </div>
      <div className="bill-id-box">
        <span>{documentNumberLabel}</span>
        <strong>{documentNumber}</strong>
      </div>
    </header>
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
