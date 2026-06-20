interface PaypalDonateProps {
  /** Extra class appended to the section wrapper for per-placement spacing tweaks. */
  className?: string;
}

/** Reusable PayPal donate block. Plain markup (no hooks) so it renders in both
 *  server and client components — used on the homepage (between groups) and on
 *  every group/team page above the header. */
export default function PaypalDonate({ className }: PaypalDonateProps) {
  return (
    <div className={`paypal-donate-section${className ? ` ${className}` : ''}`}>
      <p className="paypal-donate-heading">Support us</p>
      <p className="paypal-donate-text">
        Knockouts.in is free to use.<br />
        If you like it, drop a buck via PayPal.
      </p>
      <form action="https://www.paypal.com/donate" method="post" target="_blank">
        <input type="hidden" name="hosted_button_id" value="KL6HYXE53XDTG" />
        <button type="submit" className="paypal-donate-button" title="Donate with PayPal">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginRight: 6, verticalAlign: '-2px' }}>
            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.56c-.525 0-.963.38-1.045.9l-1.44 7.106zm7.834-15.33c-.193 0-.378.15-.41.348l-.478 2.453c-.032.197.098.348.29.348h.598c1.43 0 2.683-.29 3.227-1.852.2-.574.235-1.058.065-1.39-.2-.39-.728-.606-1.56-.606h-1.732z" />
          </svg>
          Donate with PayPal
        </button>
      </form>
    </div>
  );
}
